"""Shared backend constants."""

import os

# The frontend defaults to "center-001" everywhere (see DEFAULT_CENTER_ID in
# frontend/lib/auth-context.tsx). The backend used to default to
# "demo-center-001", so records created through the API landed in a centre the
# UI never queried. Keep these two values in step.
DEFAULT_CENTER_ID = os.getenv("DEFAULT_CENTER_ID", "center-001")
