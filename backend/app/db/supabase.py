import logging
from typing import Any, Dict, List, Optional
from supabase import create_client, Client
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize Supabase client with Service Role Key for backend administrative operations
supabase_admin: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

# PostgREST direct client headers for flexible REST queries
POSTGREST_HEADERS = {
    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def get_supabase_admin() -> Client:
    """Returns a Supabase client with pristine Service Role administrative privileges."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

async def postgrest_get(endpoint: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Helper to perform GET requests directly against Supabase PostgREST.
    If no explicit 'limit' is set in params, automatically paginates in 1000-row chunks
    to retrieve the full complete result set beyond PostgREST's default 1000-row cap.
    """
    url = f"{settings.SUPABASE_URL}/rest/v1/{endpoint}"
    queryParams = dict(params) if params else {}

    # If limit is explicitly requested (e.g. limit=20 for pagination), fetch single page
    if "limit" in queryParams:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=POSTGREST_HEADERS, params=queryParams)
            if response.status_code >= 400:
                logger.error(f"PostgREST GET error on {endpoint}: {response.text}")
                raise Exception(f"Database error ({response.status_code}): {response.text}")
            return response.json()

    # Otherwise, paginate to fetch all records
    all_results: List[Dict[str, Any]] = []
    offset = 0
    chunk_limit = 1000

    async with httpx.AsyncClient(timeout=60.0) as client:
        while True:
            chunk_params = dict(queryParams)
            chunk_params["limit"] = str(chunk_limit)
            chunk_params["offset"] = str(offset)
            response = await client.get(url, headers=POSTGREST_HEADERS, params=chunk_params)
            if response.status_code >= 400:
                logger.error(f"PostgREST GET error on {endpoint}: {response.text}")
                raise Exception(f"Database error ({response.status_code}): {response.text}")
            chunk_data = response.json()
            if not chunk_data:
                break
            all_results.extend(chunk_data)
            if len(chunk_data) < chunk_limit:
                break
            offset += chunk_limit

    return all_results

async def postgrest_post(endpoint: str, data: Any) -> Any:
    """Helper to perform POST (insert) requests directly against Supabase PostgREST."""
    url = f"{settings.SUPABASE_URL}/rest/v1/{endpoint}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, headers=POSTGREST_HEADERS, json=data)
        if response.status_code >= 400:
            logger.error(f"PostgREST POST error on {endpoint}: {response.text}")
            raise Exception(f"Database error ({response.status_code}): {response.text}")
        return response.json()

async def postgrest_patch(endpoint: str, data: Any, params: Dict[str, Any]) -> Any:
    """Helper to perform PATCH (update) requests directly against Supabase PostgREST."""
    url = f"{settings.SUPABASE_URL}/rest/v1/{endpoint}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.patch(url, headers=POSTGREST_HEADERS, json=data, params=params)
        if response.status_code >= 400:
            logger.error(f"PostgREST PATCH error on {endpoint}: {response.text}")
            raise Exception(f"Database error ({response.status_code}): {response.text}")
        return response.json()

async def postgrest_delete(endpoint: str, params: Dict[str, Any]) -> Any:
    """Helper to perform DELETE requests directly against Supabase PostgREST."""
    url = f"{settings.SUPABASE_URL}/rest/v1/{endpoint}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.delete(url, headers=POSTGREST_HEADERS, params=params)
        if response.status_code >= 400:
            logger.error(f"PostgREST DELETE error on {endpoint}: {response.text}")
            raise Exception(f"Database error ({response.status_code}): {response.text}")
        return response.json()
