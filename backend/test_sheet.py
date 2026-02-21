import asyncio
from app.adapters.google_sheets_adapter import GoogleSheetsAdapter

async def test_sheet():
    adapter = GoogleSheetsAdapter()
    config = {'spreadsheet_id': 'https://docs.google.com/spreadsheets/d/1SRVhz6oD35pb-wLHOd6TyxSRJcvwvFYeGhlXuScHLHY/edit?gid=0#gid=0'}
    try:
        await adapter.connect(config)
        headers = await adapter.get_headers()
        print('HEADERS:', headers)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print('ERROR:', e)

asyncio.run(test_sheet())
