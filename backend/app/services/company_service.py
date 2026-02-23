"""
Botivate HR Support - Company Onboarding Service
Handles company registration, policy management, DB connection,
auto-password generation, and credential distribution.
"""

import os
import uuid
import asyncio
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Company, Policy, DatabaseConnection, PolicyType
from app.models.schemas import (
    CompanyCreate, PolicyCreate, DatabaseConnectionCreate,
    SchemaAnalysisResult,
)
from app.adapters.adapter_factory import get_adapter
from app.services.schema_analyzer import analyze_schema
from app.utils.password_generator import generate_secure_password
from app.utils.email_service import send_auth_email
from app.config import settings


# ── Company CRUD ──────────────────────────────────────────

async def create_company(db: AsyncSession, data: CompanyCreate) -> Company:
    """Register a new company and create its isolated environment."""
    company = Company(
        name=data.name,
        industry=data.industry,
        hr_name=data.hr_name,
        hr_email=data.hr_email,
        hr_email_password=data.hr_email_password,
        support_email=data.support_email or data.hr_email,
        support_phone=data.support_phone,
        support_whatsapp=data.support_whatsapp,
        support_message=data.support_message or "If you face any issue like password reset, login failure, or access problem, please contact your company support.",
        login_link=data.login_link or settings.app_base_url,
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)

    # Create company-specific upload directory
    company_upload_dir = os.path.join(settings.upload_dir, company.id)
    os.makedirs(os.path.join(company_upload_dir, "documents"), exist_ok=True)

    return company


async def get_company(db: AsyncSession, company_id: str) -> Optional[Company]:
    """Fetch a single company by ID."""
    result = await db.execute(select(Company).where(Company.id == company_id))
    return result.scalar_one_or_none()


async def get_all_companies(db: AsyncSession) -> List[Company]:
    """Fetch all registered companies."""
    result = await db.execute(select(Company).where(Company.is_active == True))
    return list(result.scalars().all())


# ── Policy CRUD ───────────────────────────────────────────

async def add_text_policy(db: AsyncSession, company_id: str, data: PolicyCreate) -> Policy:
    """Add a text-based policy/rule for a company."""
    policy = Policy(
        company_id=company_id,
        title=data.title,
        description=data.description,
        policy_type=PolicyType.TEXT,
        content=data.content,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


async def add_document_policy(
    db: AsyncSession,
    company_id: str,
    title: str,
    description: str,
    file_path: str,
    file_name: str,
) -> Policy:
    """Add a document-based policy for a company."""
    policy = Policy(
        company_id=company_id,
        title=title,
        description=description,
        policy_type=PolicyType.DOCUMENT,
        file_path=file_path,
        file_name=file_name,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


async def get_policies(db: AsyncSession, company_id: str) -> List[Policy]:
    """Fetch all active policies for a company."""
    result = await db.execute(
        select(Policy).where(Policy.company_id == company_id, Policy.is_active == True)
    )
    return list(result.scalars().all())


async def delete_policy(db: AsyncSession, policy_id: str) -> bool:
    """Soft-delete a policy."""
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if policy:
        policy.is_active = False
        await db.commit()
        return True
    return False


# ── Database Connection ───────────────────────────────────

async def add_database_connection(
    db: AsyncSession,
    company_id: str,
    data: DatabaseConnectionCreate,
) -> DatabaseConnection:
    """Add a new database connection for a company and auto-analyze its schema."""
    db_conn = DatabaseConnection(
        company_id=company_id,
        title=data.title,
        description=data.description,
        db_type=data.db_type,
        connection_config=data.connection_config,
    )
    db.add(db_conn)
    await db.commit()
    await db.refresh(db_conn)
    print(f"[{company_id}][SERVICE LOG] ✅ Added Database Connection record to DB (ID: {db_conn.id}).")

    # Automatically analyze schema using AI
    try:
        print(f"[{company_id}][SERVICE LOG] 👉 Starting AI Schema Analysis for the new Database...")
        adapter = await get_adapter(data.db_type, data.connection_config)
        print(f"[{company_id}][SERVICE LOG] Adapter instantiated. Fetching headers...")
        headers = await adapter.get_headers()
        print(f"[{company_id}][SERVICE LOG] Headers found: {headers}. Sending to AI for mapping...")
        schema_result = await analyze_schema(headers)

        # Save schema map to the database connection
        db_conn.schema_map = schema_result.model_dump()
        await db.commit()
        await db.refresh(db_conn)

        # Also save to the company level for quick access
        print(f"[{company_id}][SERVICE LOG] Updating company record with new schema_map...")
        company = await get_company(db, company_id)
        if company:
            company.schema_map = schema_result.model_dump()
            await db.commit()
            print(f"[{company_id}][SERVICE LOG] ✅ Schema Map applied successfully to Company record.")

    except Exception as e:
        print(f"[{company_id}][SCHEMA ANALYSIS ERROR] ❌ Detailed failure during AI Schema generation: {str(e)}")

    return db_conn


async def get_database_connections(db: AsyncSession, company_id: str) -> List[DatabaseConnection]:
    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.company_id == company_id,
            DatabaseConnection.is_active == True,
        )
    )
    return list(result.scalars().all())


# ── Auto Password Generation & Distribution ──────────────

async def auto_provision_employees(
    db: AsyncSession,
    company_id: str,
    db_connection_id: str,
) -> dict:
    """
    After schema analysis:
    1. Add 'system_password' column to the employee sheet
    2. Generate a unique password for each employee
    3. Send credentials via email from the company's HR email
    """
    print(f"\n[{company_id}][PROVISION LOG] 🏁 Starting Auto-Provisioning for DB ID: '{db_connection_id}'...")
    # Fetch company and DB connection info
    company = await get_company(db, company_id)
    if not company:
        print(f"[{company_id}][PROVISION LOG] ❌ FAILED: Company not found.")
        return {"error": "Company not found"}

    result = await db.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == db_connection_id)
    )
    db_conn = result.scalar_one_or_none()
    if not db_conn or not db_conn.schema_map:
        print(f"[{company_id}][PROVISION LOG] ❌ FAILED: DB connection or schema missing.")
        return {"error": "Database connection or schema not found"}

    print(f"[{company_id}][PROVISION LOG] DB connection and schema_map verified. Schema: {db_conn.schema_map}")

    schema = db_conn.schema_map
    adapter = await get_adapter(db_conn.db_type, db_conn.connection_config)

    primary_key = schema.get("primary_key")
    email_col = schema.get("email")
    name_col = schema.get("employee_name")

    if not primary_key:
        print(f"[{company_id}][PROVISION LOG] ❌ FAILED: 'primary_key' not defined in schema mapping.")
        return {"error": "Could not determine primary key from schema"}

    print(f"[{company_id}][PROVISION LOG] 👉 Step 1: Telling Adapter to add 'system_password' column if it doesn't exist...")
    # Step 1: Add system_password column
    await adapter.add_column("system_password")

    print(f"[{company_id}][PROVISION LOG] 👉 Step 2: Fetching all existing records to generate passwords...")
    # Step 2: Generate passwords for all employees
    records = await adapter.get_all_records()
    print(f"[{company_id}][PROVISION LOG] Fetched {len(records)} records. Generating distinct passwords...")
    password_map = {}
    email_tasks = []

    for record in records:
        emp_id = str(record.get(primary_key, "")).strip()
        if not emp_id:
            continue

        password = generate_secure_password()
        password_map[emp_id] = password

        # Collect email info
        if email_col:
            emp_email = str(record.get(email_col, "")).strip()
            emp_name = str(record.get(name_col, "Employee")) if name_col else "Employee"
            if emp_email:
                email_tasks.append({
                    "email": emp_email,
                    "emp_id": emp_id,
                    "password": password,
                    "name": emp_name,
                })

    print(f"[{company_id}][PROVISION LOG] 👉 Step 3: Batch updating {len(password_map)} generated passwords into Google Sheet...")
    # Step 3: Write passwords to the sheet
    await adapter.update_column_values("system_password", primary_key, password_map)
    print(f"[{company_id}][PROVISION LOG] ✅ Passwords pushed to Google Sheet.")

    print(f"[{company_id}][PROVISION LOG] 👉 Step 4: Dispatching credential emails via configured SMTP...")
    # Step 4: Send credential emails
    sent_count = 0
    failed_count = 0
    
    # Use company's own email credentials if provided, otherwise fallback to system default testing email
    sender_email = company.hr_email if company.hr_email and company.hr_email_password and company.hr_email_password != 'dummy-password' else settings.smtp_user
    sender_password = company.hr_email_password if company.hr_email and company.hr_email_password and company.hr_email_password != 'dummy-password' else settings.smtp_password
    
    if sender_email and sender_password:
        for task in email_tasks:
            success = await send_auth_email(
                to_email=task["email"],
                email_type="welcome",
                company_name=company.name,
                company_id=company.id,
                employee_id=task["emp_id"],
                password=task["password"],
                login_link=company.login_link or settings.app_base_url,
                from_email=sender_email,
                from_password=sender_password,
            )
            if success:
                sent_count += 1
                print(f"[{company_id}][PROVISION LOG] 📧 Successfully sent email to {task['email']}")
            else:
                failed_count += 1
                print(f"[{company_id}][PROVISION LOG] ❌ Failed to send email to {task['email']}")
    else:
        print(f"[{company_id}][PROVISION LOG] ⚠️ Email sending skipped manually (fallback disabled?).")

    print(f"[{company_id}][PROVISION LOG] 🏁 Provisioning Complete! Stats: {len(password_map)} generated, {sent_count} sent.")

    return {
        "total_employees": len(password_map),
        "passwords_generated": len(password_map),
        "emails_sent": sent_count,
        "emails_failed": failed_count,
    }


# ── Employee Master Data Management ──────────────────────

async def get_all_employee_data(db: AsyncSession, company_id: str) -> List[dict]:
    """Fetch all employee records from the active database."""
    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.company_id == company_id,
            DatabaseConnection.is_active == True,
        )
    )
    db_conn = result.scalars().first()
    if not db_conn:
        return []
    
    adapter = await get_adapter(db_conn.db_type, db_conn.connection_config)
    return await adapter.get_all_records()


async def update_employee_record(
    db: AsyncSession, 
    company_id: str, 
    employee_id: str, 
    updates: dict
) -> dict:
    """Update a specific employee record in the connected database."""
    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.company_id == company_id,
            DatabaseConnection.is_active == True,
        )
    )
    db_conn = result.scalars().first()
    if not db_conn or not db_conn.schema_map:
        return {"error": "Database connection not found"}
    
    primary_key = db_conn.schema_map.get("primary_key")
    if not primary_key:
        return {"error": "Primary key not defined in schema mapping"}
        
    adapter = await get_adapter(db_conn.db_type, db_conn.connection_config)
    success = await adapter.update_record(primary_key, employee_id, updates)
    
    if success:
        # ── Send Update Notification if Password Changed ────
        try:
            password_key = next((k for k in updates.keys() if "password" in k.lower()), None)
            if password_key:
                # Fetch company details
                comp_result = await db.execute(select(Company).where(Company.id == company_id))
                company = comp_result.scalar_one_or_none()
                
                # Fetch current employee record to get email if not in updates
                emp_record = await adapter.get_record_by_key(primary_key, employee_id)
                if company and emp_record:
                    email_val = None
                    # Search for email in the record
                    for k, v in emp_record.items():
                        if "email" in k.lower() and "@" in str(v):
                            email_val = v
                            break
                    
                    if email_val:
                        asyncio.create_task(send_auth_email(
                            to_email=email_val,
                            email_type="password_update",
                            company_name=company.name,
                            company_id=company.id,
                            employee_id=employee_id,
                            password=updates[password_key],
                            login_link=company.login_link or settings.app_base_url,
                            from_email=company.hr_email,
                            from_password=company.hr_email_password
                        ))
                        print(f"[AUTH UPDATE] Password update email triggered for {email_val}")
        except Exception as e:
            print(f"[AUTH UPDATE ERROR] Failed to send update email: {e}")

        return {"success": True, "message": f"Employee {employee_id} updated successfully"}
    else:
        return {"success": False, "error": f"Failed to update employee {employee_id}"}


async def create_employee_record(
    db: AsyncSession,
    company_id: str,
    data: dict
) -> dict:
    """Create a new employee record in the connected database."""
    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.company_id == company_id,
            DatabaseConnection.is_active == True,
        )
    )
    db_conn = result.scalars().first()
    if not db_conn:
        return {"error": "Database connection not found"}
    
    adapter = await get_adapter(db_conn.db_type, db_conn.connection_config)
    
    # Auto-generate Employee ID if not provided
    primary_key = db_conn.schema_map.get("primary_key", "Employee ID")
    if primary_key not in data or not data[primary_key]:
        # Fetch current IDs to find the last one
        all_records = await adapter.get_all_records()
        last_id_num = 0
        import re
        for rec in all_records:
            val = str(rec.get(primary_key, ""))
            # Extract numbers from ID like EMP001
            nums = re.findall(r'\d+', val)
            if nums:
                last_id_num = max(last_id_num, int(nums[-1]))
        
        # Increment and format (e.g., EMP005)
        new_id = f"EMP{str(last_id_num + 1).zfill(3)}"
        data[primary_key] = new_id

    success = await adapter.create_record(data)
    
    if success:
        # ── Send Credential Email ───────────────────────────
        try:
            # Fetch full company details for email sending config
            result = await db.execute(select(Company).where(Company.id == company_id))
            company = result.scalar_one_or_none()
            
            if company:
                # Find email and password columns dynamically
                email_val = None
                password_val = None
                name_val = "Employee"
                
                for k, v in data.items():
                    k_low = k.lower()
                    if "email" in k_low and "@" in str(v):
                        email_val = v
                    if "password" in k_low and v:
                        password_val = v
                    if "name" in k_low and v:
                        name_val = str(v).split()[0] # Get first name

                # If no password in data, generate a temporary one
                if not password_val:
                    password_val = f"{name_val[:3].capitalize()}1234"
                
                if email_val:
                    asyncio.create_task(send_auth_email(
                        to_email=email_val,
                        email_type="welcome",
                        company_name=company.name,
                        company_id=company.id,
                        employee_id=data[primary_key],
                        password=password_val,
                        login_link=company.login_link or settings.app_base_url,
                        from_email=company.hr_email,
                        from_password=company.hr_email_password
                    ))
                    print(f"[ONBOARD] Professional Welcome Email triggered for {email_val}")
        except Exception as e:
            print(f"[EMAIL SEND ERROR] Failed in create_employee_record: {e}")

        return {"success": True, "message": f"New employee created with ID: {data[primary_key]}", "employee_id": data[primary_key]}
    else:
        return {"success": False, "error": "Failed to create employee record"}
