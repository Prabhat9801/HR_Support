"""
Botivate HR Support - AI Schema Analyzer Service
Uses LLM (Langchain) to automatically analyze database schemas.
Identifies primary keys, communication columns, employee name, and logical groupings.
Zero manual mapping required.
"""

import json
import re
from typing import List
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from app.config import settings
from app.models.schemas import SchemaAnalysisResult


async def analyze_schema(headers: List[str]) -> SchemaAnalysisResult:
    """
    Analyze column headers using AI and return a structured schema map.
    This replaces all manual column mapping.
    """
    if not settings.openai_api_key or settings.openai_api_key == "your-openai-api-key-here":
        print("⚠️ [MOCK SCHEMA] Skipping AI schema analysis because OpenAI key is missing. Using naive matcher.")
        pk, name, email, phone, whatsapp, role = None, None, None, None, None, None
        
        for h in headers:
            hl = h.lower().strip()
            
            # Primary key detection (must contain 'id' or 'code' but smarter matching)
            if not pk and any(kw in hl for kw in ["employee id", "emp id", "emp_id", "staff id", "emp code", "employee_id"]):
                pk = h
            elif not pk and hl in ["id", "code"]:
                pk = h
            
            # Name detection (prioritize columns with 'name' that are NOT IDs)
            if not name and "name" in hl and "id" not in hl and "user" not in hl:
                name = h
            
            # Email detection
            if not email and "email" in hl and "password" not in hl:
                email = h
            
            # Phone detection
            if not phone and any(kw in hl for kw in ["phone", "mobile", "contact"]) and "email" not in hl:
                phone = h
            
            # WhatsApp detection
            if not whatsapp and "whatsapp" in hl:
                whatsapp = h
            
            # Role/Designation detection
            if not role and any(kw in hl for kw in ["role", "designation", "position", "job title"]):
                role = h
        
        # Fallback: if pk not found, try any column with 'id'
        if not pk:
            for h in headers:
                if "id" in h.lower():
                    pk = h
                    break
        
        return SchemaAnalysisResult(
            primary_key=pk or (headers[0] if headers else "ID"),
            employee_name=name or (headers[1] if len(headers) > 1 else "Name"),
            email=email,
            phone=phone,
            whatsapp=whatsapp,
            role_column=role,
            categories={"other": [h for h in headers if h not in [pk, name, email, phone, whatsapp, role]]}
        )

    llm = ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0,
    )

    prompt = f"""You are a database schema analyzer for an HR system.

Below are the column headers from an employee database:

{json.dumps(headers, indent=2)}

Your task:
1. Identify the PRIMARY EMPLOYEE IDENTIFIER column (like Employee ID, Emp Code, Staff ID, etc.)
2. Identify the EMPLOYEE NAME column (like Full Name, Employee Name, Name, etc.)
3. Identify the EMAIL column (like Email, Email ID, Email Address, etc.) — if present
4. Identify the PHONE NUMBER column (like Phone, Mobile, Contact, etc.) — if present
5. Identify the WHATSAPP column (like WhatsApp, WhatsApp Number, etc.) — if present
6. Identify the ROLE OR DESIGNATION column (like Role, Designation, Position, Job Title) — if present
7. Group ALL remaining columns logically into categories like:
   - personal (personal details like DOB, gender, address, etc.)
   - job (department, designation, joining date, etc.)
   - leave (leave balance, sick leave, casual leave, etc.)
   - payroll (salary, bank details, PF, etc.)
   - status (active/inactive, probation, etc.)
   - other (anything that does not fit above categories)

Return ONLY valid JSON in this exact format:
{{
  "primary_key": "exact_column_name",
  "employee_name": "exact_column_name",
  "email": "exact_column_name_or_null",
  "phone": "exact_column_name_or_null",
  "whatsapp": "exact_column_name_or_null",
  "role_column": "exact_column_name_or_null",
  "categories": {{
    "personal": ["col1", "col2"],
    "job": ["col1", "col2"],
    "leave": ["col1"],
    "payroll": ["col1"],
    "status": ["col1"],
    "other": ["col1"]
  }}
}}

Rules:
- Use EXACT column names as they appear in the input.
- If a column type (email/phone/whatsapp/role) does not exist, set it to null.
- Every column must appear in exactly one place (either as a key field or in one category).
- Return ONLY the JSON, no explanation, no markdown.
"""

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    raw = response.content.strip()

    # Clean any accidental markdown wrapping
    clean = re.sub(r"```json|```", "", raw).strip()
    parsed = json.loads(clean)

    return SchemaAnalysisResult(**parsed)
