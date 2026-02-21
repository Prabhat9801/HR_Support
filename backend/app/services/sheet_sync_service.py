"""
Botivate HR Support – AI-Driven Dynamic Sheet Sync Service
100% Dynamic: AI reads current schema, understands the situation, 
and generates the CRUD query. ZERO hardcoded column names.
"""

import json
import re
from typing import Any, Dict, List, Optional
from app.adapters.adapter_factory import get_adapter
from app.config import settings


async def ai_sync_to_sheet(
    db_type: str,
    connection_config: dict,
    schema_map: dict,
    employee_id: str,
    action: str,
    context: dict,
    employee_current_data: Optional[dict] = None,
) -> dict:
    """
    AI-Driven Dynamic CRUD on the company's database (Google Sheet, etc.)
    
    This function:
    1. Reads current headers/schema from the actual sheet
    2. Reads the employee's current row data
    3. Gives ALL of this to the AI along with the action context
    4. AI generates the exact update plan (columns to update, values, new columns)
    5. Executes the updates

    Args:
        db_type: e.g. "google_sheets"
        connection_config: adapter connection config
        schema_map: the analyzed schema map with primary_key, etc.
        employee_id: the employee whose row to update
        action: what happened — "leave_applied", "leave_approved", "leave_rejected",
                "grievance_filed", "resignation_submitted", "profile_updated", etc.
        context: dict with all relevant details (dates, reason, decided_by, etc.)
        employee_current_data: optional pre-fetched employee row data

    Returns:
        dict with "success", "updates_applied", "new_columns_created", "error"
    """
    from app.models.models import DatabaseType

    result = {
        "success": False,
        "updates_applied": {},
        "new_columns_created": [],
        "error": None,
    }

    try:
        adapter = await get_adapter(DatabaseType(db_type), connection_config)
        primary_key = schema_map.get("primary_key", "")
        
        if not primary_key:
            result["error"] = "No primary_key in schema_map"
            return result

        # Step 1: Read current headers from the ACTUAL sheet
        headers = await adapter.get_headers()
        print(f"[SHEET SYNC] Current headers ({len(headers)}): {headers}")

        # Step 2: Read the employee's current row data (for AI to see existing values)
        if not employee_current_data:
            employee_current_data = await adapter.get_record_by_key(primary_key, employee_id)
        
        if not employee_current_data:
            result["error"] = f"Employee {employee_id} not found in sheet"
            return result

        # Step 3: Ask AI to generate the update plan
        update_plan = await _ai_generate_update_plan(
            headers=headers,
            employee_data=employee_current_data,
            employee_id=employee_id,
            action=action,
            context=context,
            primary_key=primary_key,
        )

        if not update_plan:
            result["error"] = "AI could not generate update plan"
            return result

        # Step 4: Create new columns if AI says so
        new_columns = update_plan.get("new_columns", [])
        for col_name in new_columns:
            if col_name and col_name not in headers:
                try:
                    await adapter.add_column(col_name)
                    result["new_columns_created"].append(col_name)
                    print(f"[SHEET SYNC] ✅ Created new column: '{col_name}'")
                except Exception as ce:
                    print(f"[SHEET SYNC] ❌ Failed to create column '{col_name}': {ce}")
        
        # Refresh headers after creating new columns
        if new_columns:
            headers = await adapter.get_headers()

        # Step 5: Apply the updates
        updates = update_plan.get("updates", {})
        if updates:
            # Filter out any columns that still don't exist after creation
            valid_updates = {k: v for k, v in updates.items() if k in headers}
            
            if valid_updates:
                success = await adapter.update_record(primary_key, employee_id, valid_updates)
                if success:
                    result["success"] = True
                    result["updates_applied"] = valid_updates
                    print(f"[SHEET SYNC] ✅ Updated {employee_id}: {valid_updates}")
                else:
                    result["error"] = f"update_record returned False for {employee_id}"
                    print(f"[SHEET SYNC] ❌ update_record failed for {employee_id}")
            else:
                result["error"] = "No valid columns to update after filtering"
        else:
            result["success"] = True
            result["updates_applied"] = {}
            print(f"[SHEET SYNC] ℹ️ AI decided no updates needed for this action")

    except Exception as e:
        result["error"] = str(e)
        print(f"[SHEET SYNC ERROR] {e}")

    return result


async def _ai_generate_update_plan(
    headers: List[str],
    employee_data: dict,
    employee_id: str,
    action: str,
    context: dict,
    primary_key: str,
) -> Optional[dict]:
    """
    Uses AI to dynamically generate the update plan based on:
    - Current sheet columns (headers)
    - Employee's current row data (to calculate new values like leave balance)
    - What action occurred (leave applied, approved, etc.)
    - Context details (dates, reason, decided_by, etc.)
    
    Returns: {"updates": {"col": "val"}, "new_columns": ["col1", "col2"]}
    """
    if not settings.openai_api_key or settings.openai_api_key == "your-openai-api-key-here":
        return _fallback_generate_update_plan(headers, action, context)

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage

        llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0,
        )

        prompt = f"""You are an HR database administrator. You must generate the EXACT updates to write to an employee's record in their company spreadsheet.

CURRENT SHEET COLUMNS:
{json.dumps(headers)}

EMPLOYEE'S CURRENT ROW DATA:
{json.dumps(employee_data, default=str, indent=2)}

ACTION THAT OCCURRED: "{action}"

ACTION DETAILS:
{json.dumps(context, default=str, indent=2)}

YOUR TASK:
Based on the action and the employee's current data, decide EXACTLY which columns to update and what values to set.

CRITICAL RULES:
1. ALWAYS use EXISTING column names from the sheet when a matching column exists.
   - Look at the actual column headers above and match them EXACTLY.
   - Example: if sheet has "Total Leave Balance", use "Total Leave Balance" — NOT "Leave Balance".
2. For NUMERIC calculations (like deducting leave balance):
   - Read the current value from the employee's data
   - Calculate the new value (e.g., current balance - leave days)
   - Return the CALCULATED number, not a formula
3. If no matching column exists for important data, suggest a NEW column name.
4. For dates, use the format matching what's already in the sheet.
5. The primary key column ("{primary_key}") must NEVER be updated.

EXAMPLES OF DYNAMIC BEHAVIOR:
- If action is "leave_applied" → Find any status column related to leave and set "Pending", update leave date columns
- If action is "leave_approved" → Update status to "Approved", CALCULATE new leave balance (old balance - days), update leaves taken
- If action is "leave_rejected" → Update status to "Rejected", leave balance untouched

Return ONLY valid JSON in this exact format:
{{
  "updates": {{
    "Existing Column Name": "new value",
    "Another Column": 42
  }},
  "new_columns": ["New Column Name If Needed"]
}}

Return ONLY the JSON. No explanation, no markdown."""

        resp = await llm.ainvoke([HumanMessage(content=prompt)])
        raw = resp.content.strip()
        # Clean any markdown code fences
        clean = re.sub(r"```json\s*|```\s*", "", raw).strip()
        
        plan = json.loads(clean)
        
        # Validate the plan structure
        if not isinstance(plan, dict):
            print(f"[SHEET SYNC AI] Invalid plan type: {type(plan)}")
            return _fallback_generate_update_plan(headers, action, context)
        
        if "updates" not in plan:
            plan["updates"] = {}
        if "new_columns" not in plan:
            plan["new_columns"] = []
        
        # Safety: never update the primary key
        plan["updates"].pop(primary_key, None)
        
        print(f"[SHEET SYNC AI] Generated plan: {json.dumps(plan, default=str)}")
        return plan

    except json.JSONDecodeError as je:
        print(f"[SHEET SYNC AI] JSON parse error: {je}")
        return _fallback_generate_update_plan(headers, action, context)
    except Exception as e:
        print(f"[SHEET SYNC AI] Error: {e}")
        return _fallback_generate_update_plan(headers, action, context)


def _fallback_generate_update_plan(
    headers: List[str],
    action: str,
    context: dict,
) -> dict:
    """
    Non-AI fallback: generates a basic update plan using keyword matching on existing headers.
    Not as smart as AI, but ensures the sheet is always updated.
    """
    updates = {}
    new_columns = []

    # Determine what kind of status/date/reason columns exist
    action_type = action.split("_")[0] if "_" in action else action  # "leave", "grievance", etc.
    
    # Try to find matching columns for status
    status_col = None
    reason_col = None
    date_from_col = None
    date_to_col = None
    
    for h in headers:
        h_lower = h.lower()
        if action_type in h_lower and "status" in h_lower:
            status_col = h
        if action_type in h_lower and "reason" in h_lower:
            reason_col = h
        if action_type in h_lower and ("from" in h_lower or "start" in h_lower):
            date_from_col = h
        if action_type in h_lower and ("to" in h_lower or "end" in h_lower):
            date_to_col = h
        # Also check for "upcoming" variants
        if "upcoming" in h_lower and "from" in h_lower:
            date_from_col = date_from_col or h
        if "upcoming" in h_lower and "to" in h_lower:
            date_to_col = date_to_col or h

    # Determine status value based on action
    status_value = "Pending"
    if "approved" in action:
        status_value = "Approved"
    elif "rejected" in action:
        status_value = "Rejected"
    elif "submitted" in action or "applied" in action:
        status_value = "Pending"

    # Build updates
    if status_col:
        updates[status_col] = status_value
    else:
        col_name = f"{action_type.title()} Request Status"
        new_columns.append(col_name)
        updates[col_name] = status_value

    if context.get("reason") and reason_col:
        updates[reason_col] = context["reason"]
    
    if context.get("start_date") and date_from_col:
        updates[date_from_col] = context["start_date"]
    
    if context.get("end_date") and date_to_col:
        updates[date_to_col] = context["end_date"]

    if context.get("decided_by"):
        decided_col = None
        for h in headers:
            if "decided" in h.lower() or "approved by" in h.lower():
                decided_col = h
                break
        if decided_col:
            updates[decided_col] = context["decided_by"]

    return {"updates": updates, "new_columns": new_columns}
