# app/core/exceptions.py
class GeminiProxyException(Exception):
    """Base Exception for Gemini-Proxy Application"""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

class UpstreamAPIError(GeminiProxyException):
    """Raised when the Gemini API returns an error or is unreachable"""
    def __init__(self, message: str = "Gemini API failed to process the request", status_code: int = 502):
        super().__init__(message, status_code)

class DatabaseSessionError(GeminiProxyException):
    """Raised when a DB operation fails"""
    def __init__(self, message: str = "Database transaction failed", status_code: int = 500):
        super().__init__(message, status_code)