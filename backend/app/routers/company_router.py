"""
Botivate HR Support - Company Onboarding API Router
Endpoints for company registration, policies, DB connections, and employee provisioning.
"""

import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.schemas import (
    CompanyCreate, CompanyResponse, CompanySupportInfo,
    PolicyCreate, PolicyResponse, PolicyUpdate,
    DatabaseConnectionCreate, DatabaseConnectionResponse,
)
from app.services import company_service
from app.services.rag_service import index_text_policy, index_document_file
from app.config import settings

router = APIRouter(prefix="/api/companies", tags=["Companies"])


# ── Company Registration ─────────────────────────────────

@router.post("/register", response_model=CompanyResponse)
async def register_company(data: CompanyCreate, db: AsyncSession = Depends(get_db)):
    """Register a new company in the system."""
    company = await company_service.create_company(db, data)
    return company


@router.get("/", response_model=List[CompanyResponse])
async def list_companies(db: AsyncSession = Depends(get_db)):
    """List all registered companies."""
    return await company_service.get_all_companies(db)


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(company_id: str, db: AsyncSession = Depends(get_db)):
    """Get company details by ID."""
    company = await company_service.get_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.get("/{company_id}/support", response_model=CompanySupportInfo)
async def get_support_info(company_id: str, db: AsyncSession = Depends(get_db)):
    """Get company support contact info (for login page & support card)."""
    company = await company_service.get_company(db, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanySupportInfo(
        company_name=company.name,
        support_email=company.support_email,
        support_phone=company.support_phone,
        support_whatsapp=company.support_whatsapp,
        support_message=company.support_message,
    )


# ── Text Policies ────────────────────────────────────────

@router.post("/{company_id}/policies/text", response_model=PolicyResponse)
async def add_text_policy(
    company_id: str,
    data: PolicyCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a text-based policy/rule."""
    policy = await company_service.add_text_policy(db, company_id, data)
    # Index in vector store for RAG
    if data.content:
        await index_text_policy(company_id, data.title, data.content)
    return policy


# ── Document Policies ────────────────────────────────────

@router.post("/{company_id}/policies/document", response_model=PolicyResponse)
async def upload_document_policy(
    company_id: str,
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document-based policy (PDF/DOC)."""
    upload_dir = os.path.join(settings.upload_dir, company_id, "documents")
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    policy = await company_service.add_document_policy(
        db, company_id, title, description, file_path, file.filename
    )

    # Index document in vector store for RAG
    await index_document_file(company_id, title, file_path)

    return policy


@router.get("/{company_id}/policies", response_model=List[PolicyResponse])
async def list_policies(company_id: str, db: AsyncSession = Depends(get_db)):
    """List all active policies for a company."""
    return await company_service.get_policies(db, company_id)


@router.delete("/{company_id}/policies/{policy_id}")
async def delete_policy(company_id: str, policy_id: str, db: AsyncSession = Depends(get_db)):
    """Soft-delete a policy."""
    success = await company_service.delete_policy(db, policy_id)
    if not success:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"message": "Policy deleted successfully"}


# ── Database Connections ─────────────────────────────────

@router.post("/{company_id}/databases", response_model=DatabaseConnectionResponse)
async def add_database(
    company_id: str,
    data: DatabaseConnectionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Connect a database and auto-analyze its schema using AI."""
    db_conn = await company_service.add_database_connection(db, company_id, data)
    return db_conn


@router.get("/{company_id}/databases", response_model=List[DatabaseConnectionResponse])
async def list_databases(company_id: str, db: AsyncSession = Depends(get_db)):
    """List all database connections for a company."""
    return await company_service.get_database_connections(db, company_id)


# ── Employee Auto-Provisioning ───────────────────────────

@router.post("/{company_id}/databases/{db_id}/provision")
async def provision_employees(
    company_id: str,
    db_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Auto-generate passwords and send credentials to all employees."""
    result = await company_service.auto_provision_employees(db, company_id, db_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/{company_id}/databases/{db_id}/reanalyze")
async def reanalyze_schema(
    company_id: str,
    db_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Re-analyze the schema of an existing database connection using AI."""
    from sqlalchemy import select
    from app.models.models import DatabaseConnection, Company
    from app.adapters.adapter_factory import get_adapter
    from app.services.schema_analyzer import analyze_schema

    result = await db.execute(
        select(DatabaseConnection).where(
            DatabaseConnection.id == db_id,
            DatabaseConnection.company_id == company_id,
        )
    )
    db_conn = result.scalars().first()
    if not db_conn:
        raise HTTPException(status_code=404, detail="Database connection not found.")

    # Get fresh headers from the actual database
    adapter = await get_adapter(db_conn.db_type, db_conn.connection_config)
    headers = await adapter.get_headers()
    
    # Re-run schema analysis
    schema_result = await analyze_schema(headers)
    new_schema = schema_result.model_dump()
    
    # Update both DatabaseConnection and Company
    db_conn.schema_map = new_schema
    
    company_result = await db.execute(
        select(Company).where(Company.id == company_id)
    )
    company = company_result.scalars().first()
    if company:
        company.schema_map = new_schema
    
    await db.commit()

    return {
        "message": "Schema re-analyzed successfully",
        "schema_map": new_schema,
        "headers_found": headers,
    }
