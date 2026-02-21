import asyncio
from app.database import async_session_factory
from app.services.company_service import auto_provision_employees

async def debug_provision():
    company_id = "bdbcf745-4028-46f4-9635-6f43acf6c9fa"
    db_id = "c179c41b-4732-4628-ae0a-85c37ffe8734"
    async with async_session_factory() as db:
        try:
            res = await auto_provision_employees(db, company_id, db_id)
            print("SUCCESS:", res)
        except Exception as e:
            import traceback
            err = traceback.format_exc()
            with open("debug.log", "w") as f:
                f.write(err)
            print("ERROR:", e)

if __name__ == "__main__":
    asyncio.run(debug_provision())
