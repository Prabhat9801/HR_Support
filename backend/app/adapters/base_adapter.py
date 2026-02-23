"""
Botivate HR Support - Abstract Database Adapter (Base Interface)
Any new database type must implement this interface.
This ensures the system is fully extensible (Google Sheets, PostgreSQL, MongoDB, etc.)
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseDatabaseAdapter(ABC):
    """
    Abstract base class that every database adapter must implement.
    This guarantees a uniform interface regardless of the underlying database.
    """

    @abstractmethod
    async def connect(self, config: Dict[str, Any]) -> None:
        """Establish connection to the external database using dynamic config."""
        pass

    @abstractmethod
    async def get_headers(self) -> List[str]:
        """Return the column headers / field names from the data source."""
        pass

    @abstractmethod
    async def get_all_records(self) -> List[Dict[str, Any]]:
        """Fetch all records from the data source."""
        pass

    @abstractmethod
    async def get_record_by_key(self, key_column: str, key_value: str) -> Optional[Dict[str, Any]]:
        """Fetch a single record by its primary key value."""
        pass

    @abstractmethod
    async def get_records_by_filter(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Fetch records matching the given filter criteria."""
        pass

    @abstractmethod
    async def update_record(self, key_column: str, key_value: str, updates: Dict[str, Any]) -> bool:
        """Update a single record identified by key_column = key_value."""
        pass

    @abstractmethod
    async def add_column(self, column_name: str, default_values: Optional[List[Any]] = None) -> bool:
        """Add a new column to the data source."""
        pass

    @abstractmethod
    async def update_column_values(self, column_name: str, key_column: str,
                                    key_value_map: Dict[str, Any]) -> bool:
        """Bulk update values in a specific column, keyed by the primary identifier."""
        pass

    @abstractmethod
    async def get_column_values(self, column_name: str) -> List[Any]:
        """Get all values for a specific column."""
        pass

    @abstractmethod
    async def create_record(self, data: Dict[str, Any]) -> bool:
        """Create a new record in the data source."""
        pass
