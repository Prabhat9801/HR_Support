"""
Botivate HR Support - Company Onboarding Service
Handles company registration, policy management, DB connection,
auto-password generation, and credential distribution.
"""

import os
import uuid
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
from app.utils.email_service import send_credential_email
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

    # Automatically analyze schema using AI
    try:
        adapter = await get_adapter(data.db_type, data.connection_config)
        headers = await adapter.get_headers()
        schema_result = await analyze_schema(headers)

        # Save schema map to the database connection
        db_conn.schema_map = schema_result.model_dump()
        await db.commit()
        await db.refresh(db_conn)

        # Also save to the company level for quick access
        company = await get_company(db, company_id)
        if company:
            company.schema_map = schema_result.model_dump()
            await db.commit()

    except Exception as e:
        print(f"[SCHEMA ANALYSIS ERROR] {e}")

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
    # Fetch company and DB connection info
    company = await get_company(db, company_id)
    if not company:
        return {"error": "Company not found"}

    result = await db.execute(
        select(DatabaseConnection).where(DatabaseConnection.id == db_connection_id)
    )
    db_conn = result.scalar_one_or_none()
    if not db_conn or not db_conn.schema_map:
        return {"error": "Database connection or schema not found"}

    schema = db_conn.schema_map
    adapter = await get_adapter(db_conn.db_type, db_conn.connection_config)

    primary_key = schema.get("primary_key")
    email_col = schema.get("email")
    name_col = schema.get("employee_name")

    if not primary_key:
        return {"error": "Could not determine primary key from schema"}

    # Step 1: Add system_password column
    await adapter.add_column("system_password")

    # Step 2: Generate passwords for all employees
    records = await adapter.get_all_records()
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

    # Step 3: Write passwords to the sheet
    await adapter.update_column_values("system_password", primary_key, password_map)

    # Step 4: Send credential emails
    sent_count = 0
    failed_count = 0
    
    # Use company's own email credentials if provided, otherwise fallback to system default testing email
    sender_email = company.hr_email if company.hr_email and company.hr_email_password and company.hr_email_password != 'dummy-password' else settings.smtp_user
    sender_password = company.hr_email_password if company.hr_email and company.hr_email_password and company.hr_email_password != 'dummy-password' else settings.smtp_password
    
    if sender_email and sender_password:
        for task in email_tasks:
            success = await send_credential_email(
                to_email=task["email"],
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
            else:
                failed_count += 1
    else:
        print("[WARNING] Email sending skipped due to missing SMTP credentials.")

    return {
        "total_employees": len(password_map),
        "passwords_generated": len(password_map),
        "emails_sent": sent_count,
        "emails_failed": failed_count,
    }
