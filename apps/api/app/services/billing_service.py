from typing import Protocol


class BillingProvider(Protocol):
    def create_checkout_session(self, user_id: int, plan: str) -> str:
        ...

    def sync_subscription_status(self, user_id: int) -> None:
        ...


class StubBillingProvider:
    """Placeholder for a future Stripe or enterprise billing integration."""

    def create_checkout_session(self, user_id: int, plan: str) -> str:
        raise NotImplementedError(
            "Billing is intentionally stubbed. Add Stripe checkout integration here later."
        )

    def sync_subscription_status(self, user_id: int) -> None:
        return None
