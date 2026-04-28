from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import CloudSearch, Monitor, SavedSearch, User
from app.schemas import (
    BatchSearchItem,
    BatchSearchRequest,
    BatchSearchResponse,
    CloudAnalysisRequest,
    CloudAnalysisResponse,
    CloudSearchRequest,
    CloudSearchResponse,
    ImageUploadRequest,
    ImageUploadResponse,
    MonitorRequest,
    MonitorResponse,
    SavedSearchResponse,
    SaveSearchRequest,
    SearchHistoryResponse,
    UsageResponse,
)
from app.services.analysis_service import mock_ai_analysis
from app.services.search_service import mock_search_results
from app.services.upload_service import find_uploaded_image, save_image_data_url
from app.usage import record_cloud_usage, usage_snapshot

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


@router.post("/search", response_model=CloudSearchResponse)
def cloud_search(
    request: CloudSearchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CloudSearchResponse:
    usage = record_cloud_usage(db, user, 1)
    db.add(
        CloudSearch(
            user_id=user.id,
            image_url=request.image_url,
            page_url=request.page_url,
            enabled_engines=request.enabled_engines,
        )
    )
    results = mock_search_results(request.image_url, request.page_url, request.enabled_engines)
    db.commit()
    return CloudSearchResponse(results=results, usage=usage)


@router.post("/upload-image", response_model=ImageUploadResponse)
def upload_image(
    request_body: ImageUploadRequest,
    request: Request,
    user: User = Depends(get_current_user),
) -> ImageUploadResponse:
    _ = user
    upload = save_image_data_url(request_body.image_data_url)
    return ImageUploadResponse(
        upload_id=upload.upload_id,
        image_url=str(request.url_for("get_uploaded_image", upload_id=upload.upload_id)),
        content_type=upload.content_type,
        size_bytes=upload.size_bytes,
    )


@router.get("/uploads/{upload_id}", name="get_uploaded_image")
def get_uploaded_image(
    upload_id: str = Path(pattern=r"^[A-Za-z0-9_-]+$"),
) -> FileResponse:
    upload = find_uploaded_image(upload_id)
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Uploaded image not found.",
        )
    return FileResponse(upload.path, media_type=upload.content_type)


@router.post("/analyze", response_model=CloudAnalysisResponse)
def cloud_analyze(
    request: CloudAnalysisRequest,
    user: User = Depends(get_current_user),
) -> CloudAnalysisResponse:
    _ = user
    return mock_ai_analysis(request.image_url, request.page_url)


@router.post("/save-search", response_model=SavedSearchResponse)
def save_search(
    request: SaveSearchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedSearch:
    saved = SavedSearch(
        user_id=user.id,
        image_url=request.image_url,
        page_url=request.page_url,
        title=request.title,
        notes=request.notes,
        tags=request.tags,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


@router.get("/search-history", response_model=list[SearchHistoryResponse])
def search_history(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CloudSearch]:
    return list(
        db.scalars(
            select(CloudSearch)
            .where(CloudSearch.user_id == user.id)
            .order_by(desc(CloudSearch.created_at))
            .limit(50)
        )
    )


@router.post("/batch-search", response_model=BatchSearchResponse)
def batch_search(
    request: BatchSearchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BatchSearchResponse:
    usage = record_cloud_usage(db, user, len(request.image_urls))
    items: list[BatchSearchItem] = []
    for image_url in request.image_urls:
        db.add(
            CloudSearch(
                user_id=user.id,
                image_url=image_url,
                page_url=request.page_url,
                enabled_engines=request.enabled_engines,
            )
        )
        items.append(
            BatchSearchItem(
                image_url=image_url,
                results=mock_search_results(image_url, request.page_url, request.enabled_engines),
            )
        )
    db.commit()
    return BatchSearchResponse(items=items, usage=usage)


@router.post("/monitor", response_model=MonitorResponse)
def create_monitor(
    request: MonitorRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Monitor:
    monitor = Monitor(
        user_id=user.id,
        image_url=request.image_url,
        page_url=request.page_url,
        frequency=request.frequency,
        active=True,
        config=request.config,
    )
    db.add(monitor)
    db.commit()
    db.refresh(monitor)
    return monitor


@router.get("/usage", response_model=UsageResponse)
def usage(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UsageResponse:
    return usage_snapshot(db, user)
