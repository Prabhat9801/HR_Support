"""
Botivate HR Support — Database Operations Agent (Multi-Agent Architecture)
A dedicated LangGraph agent that handles ALL CRUD operations on the company's 
external database (Google Sheets, etc.)

This agent is called as a SUB-AGENT by the HR Conversational Agent.
It has its own LangGraph pipeline:
  1. connect_and_read_schema → Connects to the sheet, reads headers
  2. read_employee_data → Fetches the employee's current row
  3. plan_updates → AI generates the exact update plan based on schema + context
  4. execute_updates → Writes to the sheet
  5. verify_updates → Re-reads the row to confirm changes were applied
"""

import json
import re
from typing import Any, Dict, List, Optional, TypedDict
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from app.config import settings
from app.adapters.adapter_factory import get_adapter
from app.models.models import DatabaseType


# ── Agent State ──────────────────────────────────────────

class DBAgentState(TypedDict):
    # Input
    db_type: str
    connection_config: Dict[str, Any]
    schema_map: Dict[str, Any]
    employee_id: str
    action: str              # "leave_request_applied", "leave_request_approved", etc.
    context: Dict[str, Any]  # Rich context: dates, reason, decided_by, etc.
    
    # Working state
    headers: List[str]
    employee_data: Dict[str, Any]
    primary_key: str
    update_plan: Dict[str, Any]   # {"updates": {...}, "new_columns": [...]}
    
    # Output
    success: bool
    updates_applied: Dict[str, Any]
    new_columns_created: List[str]
    error: Optional[str]
    verification: Optional[Dict[str, Any]]
    retry_count: int


# ── LLM ──────────────────────────────────────────────────

def get_db_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0,
    )


# ── Node 1: Connect & Read Schema ──────────────────────

async def connect_and_read_schema(state: DBAgentState) -> DBAgentState:
    """Connect to the database and read current headers/schema."""
    try:
        adapter = await get_adapter(
            DatabaseType(state["db_type"]), 
            state["connection_config"]
        )
        headers = await adapter.get_headers()
        primary_key = state["schema_map"].get("primary_key", "")
        
        if not primary_key:
            state["error"] = "No primary_key in schema_map. Cannot identify employee row."
            state["success"] = False
            return state
        
        if primary_key not in headers:
            state["error"] = f"Primary key column '{primary_key}' not found in sheet headers: {headers}"
            state["success"] = False
            return state
        
        state["headers"] = headers
        state["primary_key"] = primary_key
        print(f"[DB AGENT] ✅ Schema read: {len(headers)} columns, PK='{primary_key}'")
        
    except Exception as e:
        state["error"] = f"Connection failed: {str(e)}"
        state["success"] = False
        print(f"[DB AGENT] ❌ Connection error: {e}")
    
    return state


# ── Node 2: Read Employee's Current Data ────────────────

async def read_employee_data(state: DBAgentState) -> DBAgentState:
    """Fetch the employee's current row from the sheet."""
    if state.get("error"):
        return state  # Skip if previous node failed
    
    try:
        adapter = await get_adapter(
            DatabaseType(state["db_type"]),
            state["connection_config"]
        )
        record = await adapter.get_record_by_key(state["primary_key"], state["employee_id"])
        
        if not record:
            # Fallback search
            all_records = await adapter.get_all_records()
            for rec in all_records:
                rec_val = str(rec.get(state["primary_key"], "")).strip().lower()
                if rec_val == str(state["employee_id"]).strip().lower():
                    record = rec
                    break

        if not record:
            state["error"] = f"Employee '{state['employee_id']}' not found in the sheet."
            state["success"] = False
            return state
        
        state["employee_data"] = record
        print(f"[DB AGENT] ✅ Employee data read: {state['employee_id']} ({len(record)} fields)")
        
    except Exception as e:
        state["error"] = f"Read failed: {str(e)}"
        state["success"] = False
        print(f"[DB AGENT] ❌ Read error: {e}")
    
    return state


# ── Node 3: Plan Updates (AI generates the CRUD) ────────

async def plan_updates(state: DBAgentState) -> DBAgentState:
    """AI analyzes the schema, current data, and action context to generate the exact update plan."""
    if state.get("error"):
        return state
    
    try:
        if not settings.openai_api_key or settings.openai_api_key == "your-openai-api-key-here":
            # Fallback without AI
            state["update_plan"] = _fallback_plan(state["headers"], state["action"], state["context"])
            return state
        
        llm = get_db_llm()
        
        prompt = f"""You are an expert HR database administrator. Your task is to generate the EXACT updates to write to an employee's spreadsheet row.

=== CURRENT SHEET COLUMNS ===
{json.dumps(state['headers'])}

=== EMPLOYEE'S CURRENT ROW DATA ===
{json.dumps(state['employee_data'], default=str, indent=2)}

=== ACTION THAT OCCURRED ===
"{state['action']}"

=== ACTION DETAILS ===
{json.dumps(state['context'], default=str, indent=2)}

LEAVE CALCULATION RULES (STRICT CONSISTENCY):
1. If action is "leave_request_approved":
   - Read the 'duration' or 'days' from ACTION DETAILS. (Let's call this 'X')
   - Identify Numeric Columns: "Leaves Taken", "Leaves Remaining", "Days Taken", "Balance", etc.
   - For "Taken" columns: New Value = Current Value + X.
   - For "Remaining", "Balance", or "Available" columns: New Value = Current Value - X.
   - If there is a "Total Entitlement" or "Carry Forward" column, do NOT change it (it's the max limit).
   - Ensure the new values satisfy: [Total Entitlement] = [New Taken] + [New Remaining] (if all three exist).
2. If action is "applied":
   - Update "Status" to "Pending" or "Applied".
   - Do NOT subtract or add to numeric balances yet.
   - Update "Upcoming Leave" or "Last Action" columns with dates from context.
3. If action is "rejected":
   - Update "Status" to "Rejected".
   - Do NOT change any balances.

GENERAL RULES:
1. USE EXACT COLUMN NAMES bit-for-bit from CURRENT SHEET COLUMNS.
2. For dates (Last Leave From/To), use the format from existing row data (likely DD/MM/YYYY).
3. Return final NUMBERS, not strings of math (e.g. 15, not "15 days").
4. Never update the primary key column ("{state['primary_key']}").

=== RESPONSE FORMAT ===
Return ONLY valid JSON:
{{
  "updates": {{
    "Exact Column Name": "new value or number"
  }},
  "new_columns": []
}}
No explanations. Only JSON."""

        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = resp.content.strip()
        clean = re.sub(r"```json\s*|```\s*", "", raw).strip()
        
        plan = json.loads(clean)
        
        # Safety validations
        if not isinstance(plan, dict):
            raise ValueError(f"Plan is not a dict: {type(plan)}")
        
        plan.setdefault("updates", {})
        plan.setdefault("new_columns", [])
        
        # Never update the primary key
        plan["updates"].pop(state["primary_key"], None)
        
        state["update_plan"] = plan
        print(f"[DB AGENT] ✅ Update plan generated: {len(plan['updates'])} updates, {len(plan['new_columns'])} new columns")
        print(f"[DB AGENT] Plan details: {json.dumps(plan, default=str)}")
        
    except json.JSONDecodeError as je:
        print(f"[DB AGENT] ⚠️ AI JSON parse error: {je}, using fallback")
        state["update_plan"] = _fallback_plan(state["headers"], state["action"], state["context"])
    except Exception as e:
        print(f"[DB AGENT] ⚠️ Plan error: {e}, using fallback")
        state["update_plan"] = _fallback_plan(state["headers"], state["action"], state["context"])
    
    return state


# ── Node 4: Execute Updates ──────────────────────────────

async def execute_updates(state: DBAgentState) -> DBAgentState:
    """Execute the AI-generated update plan on the actual sheet."""
    if state.get("error"):
        return state
    
    plan = state.get("update_plan", {})
    updates = plan.get("updates", {})
    new_columns = plan.get("new_columns", [])
    
    if not updates and not new_columns:
        state["success"] = True
        state["updates_applied"] = {}
        state["new_columns_created"] = []
        print("[DB AGENT] ℹ️ No updates needed")
        return state
    
    try:
        adapter = await get_adapter(
            DatabaseType(state["db_type"]),
            state["connection_config"]
        )
        
        # Step 1: Create new columns first
        created_cols = []
        for col_name in new_columns:
            if col_name and col_name not in state["headers"]:
                try:
                    await adapter.add_column(col_name)
                    created_cols.append(col_name)
                    print(f"[DB AGENT] ✅ Created column: '{col_name}'")
                except Exception as ce:
                    print(f"[DB AGENT] ⚠️ Failed to create column '{col_name}': {ce}")
        
        # Refresh headers after creating columns
        if created_cols:
            state["headers"] = await adapter.get_headers()
        
        # Step 2: Execute the updates
        if updates:
            success = await adapter.update_record(
                state["primary_key"], 
                state["employee_id"], 
                updates
            )
            
            if success:
                state["success"] = True
                state["updates_applied"] = updates
                state["new_columns_created"] = created_cols
                print(f"[DB AGENT] ✅ Sheet UPDATED for {state['employee_id']}: {updates}")
            else:
                state["error"] = f"update_record returned False for employee {state['employee_id']}"
                state["success"] = False
                print(f"[DB AGENT] ❌ update_record returned False")
        else:
            state["success"] = True
            state["updates_applied"] = {}
            state["new_columns_created"] = created_cols
            
    except Exception as e:
        state["error"] = f"Execute failed: {str(e)}"
        state["success"] = False
        print(f"[DB AGENT] ❌ Execute error: {e}")
    
    return state


# ── Node 5: Verify Updates ──────────────────────────────

async def verify_updates(state: DBAgentState) -> DBAgentState:
    """Re-read the employee's row to verify the updates were applied."""
    if not state.get("success"):
        # If execution failed, try retry
        retry = state.get("retry_count", 0)
        if retry < 2 and state.get("update_plan"):
            state["retry_count"] = retry + 1
            state["error"] = None  # Clear error for retry
            print(f"[DB AGENT] 🔄 Retrying... attempt {retry + 1}")
            return state
        return state
    
    try:
        adapter = await get_adapter(
            DatabaseType(state["db_type"]),
            state["connection_config"]
        )
        
        updated_record = await adapter.get_record_by_key(
            state["primary_key"], 
            state["employee_id"]
        )
        
        if updated_record:
            # Verify each update was applied
            verified = {}
            failed = {}
            for col, expected_val in state.get("updates_applied", {}).items():
                actual_val = updated_record.get(col)
                if str(actual_val).strip() == str(expected_val).strip():
                    verified[col] = actual_val
                else:
                    failed[col] = {"expected": expected_val, "actual": actual_val}
            
            state["verification"] = {
                "verified_count": len(verified),
                "failed_count": len(failed),
                "verified_fields": verified,
                "failed_fields": failed,
            }
            
            if failed:
                print(f"[DB AGENT] ⚠️ Verification: {len(verified)} OK, {len(failed)} MISMATCH: {failed}")
            else:
                print(f"[DB AGENT] ✅ Verification: ALL {len(verified)} fields confirmed!")
        else:
            state["verification"] = {"error": "Could not re-read record for verification"}
            
    except Exception as e:
        print(f"[DB AGENT] ⚠️ Verification error (non-critical): {e}")
        state["verification"] = {"error": str(e)}
    
    return state


# ── Routing Logic ────────────────────────────────────────

def should_retry(state: DBAgentState) -> str:
    """After verify, decide if we need to retry or finish."""
    if not state.get("success") and state.get("retry_count", 0) < 2:
        return "retry"
    return "done"


# ── Non-AI Fallback Plan ────────────────────────────────

def _fallback_plan(headers: List[str], action: str, context: dict) -> dict:
    """Generate basic update plan without AI."""
    updates = {}
    new_columns = []
    
    # Parse action type
    parts = action.split("_")
    action_type = parts[0] if parts else "request"  # "leave", "grievance", etc.
    action_status = parts[-1] if len(parts) > 1 else "applied"  # "applied", "approved", "rejected"
    
    status_value = {
        "applied": "Pending",
        "approved": "Approved", 
        "rejected": "Rejected",
    }.get(action_status, "Pending")
    
    # Find matching columns
    for h in headers:
        h_lower = h.lower()
        if action_type in h_lower and "status" in h_lower:
            updates[h] = status_value
        if action_type in h_lower and "reason" in h_lower and context.get("reason"):
            updates[h] = context["reason"]
        if "upcoming" in h_lower and "from" in h_lower and context.get("start_date"):
            updates[h] = context["start_date"]
        if "upcoming" in h_lower and "to" in h_lower and context.get("end_date"):
            updates[h] = context["end_date"]
    
    # If no status column found, create one
    if not any("status" in k.lower() for k in updates):
        col = f"{action_type.title()} Request Status"
        new_columns.append(col)
        updates[col] = status_value
    
    return {"updates": updates, "new_columns": new_columns}


# ── Build the DB Agent Graph ─────────────────────────────

def build_db_agent_graph() -> StateGraph:
    """Construct the Database Operations Agent LangGraph."""
    graph = StateGraph(DBAgentState)
    
    # Add nodes
    graph.add_node("connect_and_read_schema", connect_and_read_schema)
    graph.add_node("read_employee_data", read_employee_data)
    graph.add_node("plan_updates", plan_updates)
    graph.add_node("execute_updates", execute_updates)
    graph.add_node("verify_updates", verify_updates)
    
    # Set entry point
    graph.set_entry_point("connect_and_read_schema")
    
    # Linear flow: connect → read → plan → execute → verify
    graph.add_edge("connect_and_read_schema", "read_employee_data")
    graph.add_edge("read_employee_data", "plan_updates")
    graph.add_edge("plan_updates", "execute_updates")
    graph.add_edge("execute_updates", "verify_updates")
    
    # After verify: retry or finish
    graph.add_conditional_edges(
        "verify_updates",
        should_retry,
        {
            "retry": "execute_updates",  # Retry from execute
            "done": END,
        },
    )
    
    return graph


# Compile the DB agent graph once
db_agent_graph = build_db_agent_graph().compile()


# ── Public API ───────────────────────────────────────────

async def run_db_agent(
    db_type: str,
    connection_config: dict,
    schema_map: dict,
    employee_id: str,
    action: str,
    context: dict,
) -> dict:
    """
    Public entry point: run the Database Agent to perform a CRUD operation.
    
    Args:
        db_type: "google_sheets", "postgresql", etc.
        connection_config: Adapter connection config
        schema_map: Schema map with primary_key, etc.
        employee_id: Which employee's row to update
        action: "leave_request_applied", "leave_request_approved", etc.
        context: Rich context dict with details
    
    Returns:
        {success, updates_applied, new_columns_created, error, verification}
    """
    initial_state: DBAgentState = {
        "db_type": db_type,
        "connection_config": connection_config,
        "schema_map": schema_map,
        "employee_id": employee_id,
        "action": action,
        "context": context,
        "headers": [],
        "employee_data": {},
        "primary_key": "",
        "update_plan": {},
        "success": False,
        "updates_applied": {},
        "new_columns_created": [],
        "error": None,
        "verification": None,
        "retry_count": 0,
    }
    
    print(f"\n[DB AGENT] 🚀 Starting DB Agent for {employee_id} | Action: {action}")
    print(f"[DB AGENT] Context: {json.dumps(context, default=str)}")
    
    result = await db_agent_graph.ainvoke(initial_state)
    
    output = {
        "success": result.get("success", False),
        "updates_applied": result.get("updates_applied", {}),
        "new_columns_created": result.get("new_columns_created", []),
        "error": result.get("error"),
        "verification": result.get("verification"),
    }
    
    if output["success"]:
        print(f"[DB AGENT] ✅ COMPLETED: {output['updates_applied']}")
    else:
        print(f"[DB AGENT] ❌ FAILED: {output['error']}")
    
    return output
