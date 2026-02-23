"""
Botivate HR Support - Authentication API Router
Login system: Role + Company ID + Employee ID + Password
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.schemas import LoginRequest, LoginResponse
from app.services.company_service import get_company
from app.adapters.adapter_factory import get_adapter
from app.utils.auth import create_access_token

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Single entry point login.
    Validates: Company ID → Employee ID → Password → Role
    """
    company_id = data.company_id.strip()
    employee_id = data.employee_id.strip()
    password = data.password.strip()

    print(f"\n[{company_id}][AUTH LOG] 🏁 Starting Login Process for Employee ID: '{employee_id}'")

    # Step 1: Verify company exists
    print(f"[{company_id}][AUTH LOG] Step 1: Querying database to verify company exists...")
    company = await get_company(db, company_id)
    if not company:
        print(f"[{company_id}][AUTH LOG] ❌ FAILED: Company with ID '{company_id}' not found.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Company ID. Company not found.",
        )
    print(f"[{company_id}][AUTH LOG] ✅ SUCCESS: Company found -> '{company.name}'")

    # Step 2: Get company's database connection
    print(f"[{company_id}][AUTH LOG] Step 2: Fetching active Database Connection for company...")
    from app.models.models import DatabaseConnection
    from sqlalchemy import select
    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.company_id == company_id,
            DatabaseConnection.is_active == True,
        )
    )
    db_conn = result.scalars().first()
    if not db_conn or not db_conn.schema_map:
        print(f"[{company_id}][AUTH LOG] ❌ FAILED: Active Database Connection missing or schema_map lacks for company.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Company database not configured properly.",
        )
    print(f"[{company_id}][AUTH LOG] ✅ SUCCESS: Active DB Connection found: Type -> {db_conn.db_type}")

    # Step 3: Fetch employee record from the external database
    print(f"[{company_id}][AUTH LOG] Step 3: Getting Database Adapter for type '{db_conn.db_type}'...")
    adapter = await get_adapter(db_conn.db_type, db_conn.connection_config)
    schema = db_conn.schema_map
    primary_key = schema.get("primary_key", "")
    print(f"[{company_id}][AUTH LOG] Current Schema Primary Key: '{primary_key}'")

    # Auto-validate schema: if primary_key not in actual headers, re-analyze
    try:
        actual_headers = await adapter.get_headers()
        print(f"[{company_id}][AUTH LOG] Adapter retrieved headers: {actual_headers}")
        if primary_key not in actual_headers:
            print(f"[{company_id}][AUTH LOG] ⚠️ WARNING: Schema primary_key '{primary_key}' not found in actual headers. Re-analyzing schema now...")
            from app.services.schema_analyzer import analyze_schema
            new_schema = await analyze_schema(actual_headers)
            schema = new_schema.model_dump()
            db_conn.schema_map = schema
            company.schema_map = schema
            await db.commit()
            primary_key = schema.get("primary_key", "")
            print(f"[{company_id}][AUTH LOG] ✅ SUCCESS: Re-analyzed schema. New primary_key: '{primary_key}'")
    except Exception as e:
        print(f"[{company_id}][AUTH LOG] ❌ Schema validation non-fatal error: {e}")

    print(f"[{company_id}][AUTH LOG] Step 3.5: Looking up employee ID '{employee_id}' across column '{primary_key}' in DB...")
    employee = await adapter.get_record_by_key(primary_key, employee_id)
    
    if not employee:
        print(f"[{company_id}][AUTH LOG] ❌ FAILED: Record for employee '{employee_id}' not found in DB.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Employee ID. Employee not found (searched column: '{primary_key}').",
        )
    print(f"[{company_id}][AUTH LOG] ✅ SUCCESS: Employee Record retrieved successfully from DB.")

    # Step 4: Validate password
    print(f"[{company_id}][AUTH LOG] Step 4: Validating password for employee...")
    stored_password = str(employee.get("system_password", "")).strip()
    if not stored_password or stored_password != password:
        print(f"[{company_id}][AUTH LOG] ❌ FAILED: Password mismatch. Stored: '{stored_password}' (hidden), Submitted: '{password}' (hidden)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password.",
        )
    print(f"[{company_id}][AUTH LOG] ✅ SUCCESS: Password verified.")

    # Step 5: Get employee name and dynamically determine role
    print(f"[{company_id}][AUTH LOG] Step 5: Determining employee role based on schema & data...")
    name_col = schema.get("employee_name", "")
    employee_name = str(employee.get(name_col, "Employee")).strip()
    print(f"[{company_id}][AUTH LOG] Employee Name resolved as: '{employee_name}'")

    determined_role = "employee"
    
    # Use AI-detected role column to find the job title
    role_col = schema.get("role_column")
    designation = ""
    if role_col and role_col in employee:
        designation = str(employee.get(role_col, "")).strip()
    else:
        # Fallback if AI didn't map a role column specifically: search via keywords
        for col_key, col_val in employee.items():
            k_lower = str(col_key).lower()
            if any(kw in k_lower for kw in ["role", "designation", "title", "position"]):
                designation = str(col_val).strip()
                break
    
    print(f"[{company_id}][AUTH LOG] Employee raw Designation/Title found in DB: '{designation}'")

    if designation:
        from app.config import settings
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage
        from pydantic import BaseModel as PydanticBaseModel, field_validator as pydantic_validator
        
        # Pydantic model for validated role output
        class RoleClassification(PydanticBaseModel):
            role: str
            
            @pydantic_validator('role')
            @classmethod
            def validate_role(cls, v):
                allowed = {"hr", "manager", "admin", "ceo", "employee"}
                v = v.strip().lower()
                if v not in allowed:
                    return "employee"  # Default to safest role
                return v
        
        # If we have an openai key, let the AI categorize the arbitrary job title securely
        if settings.openai_api_key and settings.openai_api_key != "your-openai-api-key-here":
            try:
                print(f"[{company_id}][AUTH LOG] AI is determining role category for '{designation}'...")
                llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, temperature=0)
                prompt = f"""
Given the employee job title/designation: "{designation}"
Categorize it strictly into ONE of the following system roles:

- "hr" → Human Resources staff, Talent Acquisition, Recruitment, People Ops, HR Executive, HR Manager
- "manager" → Team Leads, Engineering Managers, Department Heads, Project Managers (people who supervise teams)
- "admin" → Directors, VPs, Chief Officers (EXCEPT CEO), Senior Vice Presidents (EXECUTIVE leadership only, NOT IT administrators)
- "ceo" → Chief Executive Officer, Founder, Owner, Managing Director, President
- "employee" → Software Engineers, Developers, Analysts, Designers, System Administrators, IT Support, Network Engineers, Database Admins, Technical Staff, and ANY other non-leadership role

CRITICAL DISTINCTION:
- "System Administrator" / "IT Administrator" / "Network Admin" = "employee" (these are TECHNICAL roles, NOT leadership)
- "Administrative Director" / "VP of Administration" = "admin" (these are LEADERSHIP roles)

Respond ONLY with one word: hr, manager, admin, ceo, or employee.
"""
                resp = await llm.ainvoke([HumanMessage(content=prompt)])
                ai_role = resp.content.strip().lower()
                # Validate with Pydantic
                validated = RoleClassification(role=ai_role)
                determined_role = validated.role
                print(f"[{company_id}][AUTH LOG] ✅ SUCCESS: AI classified '{designation}' → '{determined_role}'")
            except Exception as e:
                print(f"[{company_id}][AUTH LOG] ❌ ROLE AI PIPELINE ERROR: {e}. Falling back to keyword search.")

        # Fallback to naive string matching if API call fails or key is missing
        if determined_role == "employee":
            print(f"[{company_id}][AUTH LOG] Executing Keyword Fallback for classification of '{designation}'...")
            v_lower = designation.lower()
            if "hr " in v_lower or v_lower == "hr" or "human resources" in v_lower or "hr executive" in v_lower:
                determined_role = "hr"
            elif "manager" in v_lower or "team lead" in v_lower or "head of" in v_lower:
                determined_role = "manager"
            elif ("director" in v_lower or "vp " in v_lower or "vice president" in v_lower) and "system" not in v_lower:
                determined_role = "admin"
            elif "ceo" in v_lower or "founder" in v_lower or "owner" in v_lower:
                determined_role = "ceo"

            print(f"[{company_id}][AUTH LOG] Fallback classification resulted in role: '{determined_role}'")

    # Security verification: If employee's email matches the registered HR email, upgrade access to HR
    email_col = schema.get("email", "")
    if email_col:
        emp_email = str(employee.get(email_col, "")).strip().lower()
        hr_email_addr = str(company.hr_email).strip().lower()
        print(f"[{company_id}][AUTH LOG] Security Email Check: Employee=({emp_email}), Company HR=({hr_email_addr})")
        if emp_email and hr_email_addr and emp_email == hr_email_addr:
            determined_role = "hr"
            print(f"[{company_id}][AUTH LOG] 👑 Upgraded role to HR as email matches company admin registration.")

    # Step 6: Create JWT token
    print(f"[{company_id}][AUTH LOG] Step 6: Finalizing role classification: '{determined_role}'. Creating JWT Access Token...")
    normalized_emp_id = employee_id
    token_data = {
        "company_id": company_id,
        "employee_id": normalized_emp_id,
        "employee_name": employee_name,
        "role": determined_role,
    }
    access_token = create_access_token(token_data)
    print(f"[{company_id}][AUTH LOG] ✅ SUCCESS: JWT created. Access Granted for {employee_name} ({normalized_emp_id}). Returning mapping details.")

    from app.models.models import UserRole
    # Map the determined role string to the enum to return
    resolved_enum_role = UserRole(determined_role) if determined_role in [e.value for e in UserRole] else UserRole.EMPLOYEE

    return LoginResponse(
        access_token=access_token,
        employee_id=normalized_emp_id,
        employee_name=employee_name,
        company_id=data.company_id.strip(),
        company_name=company.name,
        role=resolved_enum_role,
    )
