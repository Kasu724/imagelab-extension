from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PlanName = Literal["free", "pro", "creator", "team"]


class UsageResponse(BaseModel):
    plan: PlanName
    used: int
    limit: int | None
    remaining: int | None
    period: str


class SearchResult(BaseModel):
    engine: str
    title: str
    url: str
    thumbnail_url: str | None = None
    snippet: str
    confidence: float = Field(ge=0, le=1)


class CloudSearchRequest(BaseModel):
    image_url: str = Field(min_length=1)
    page_url: str | None = None
    enabled_engines: list[str] = Field(
        default_factory=lambda: ["google", "bing", "tineye", "yandex", "saucenao"]
    )


class CloudSearchResponse(BaseModel):
    results: list[SearchResult]
    usage: UsageResponse


class CloudAnalysisRequest(BaseModel):
    image_url: str = Field(min_length=1)
    page_url: str | None = None


class CloudAnalysisResponse(BaseModel):
    description: str
    likely_objects: list[str]
    likely_source_hints: list[str]
    suggested_queries: list[str]


class ImageUploadRequest(BaseModel):
    image_data_url: str = Field(min_length=1)
    filename: str | None = None


class ImageUploadResponse(BaseModel):
    upload_id: str
    image_url: str
    content_type: str
    size_bytes: int


class SaveSearchRequest(BaseModel):
    image_url: str = Field(min_length=1)
    page_url: str | None = None
    title: str | None = None
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)


class SavedSearchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: str
    page_url: str | None
    title: str | None
    notes: str | None
    tags: list[str]
    created_at: datetime


class SearchHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: str
    page_url: str | None
    enabled_engines: list[str]
    created_at: datetime


class BatchSearchRequest(BaseModel):
    image_urls: list[str] = Field(min_length=1, max_length=50)
    page_url: str | None = None
    enabled_engines: list[str] = Field(
        default_factory=lambda: ["google", "bing", "tineye", "yandex", "saucenao"]
    )


class BatchSearchItem(BaseModel):
    image_url: str
    results: list[SearchResult]


class BatchSearchResponse(BaseModel):
    items: list[BatchSearchItem]
    usage: UsageResponse


class MonitorRequest(BaseModel):
    image_url: str = Field(min_length=1)
    page_url: str | None = None
    frequency: str = "weekly"
    config: dict = Field(default_factory=dict)


class MonitorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: str
    page_url: str | None
    frequency: str
    active: bool
    created_at: datetime
