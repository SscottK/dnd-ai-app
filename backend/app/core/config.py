from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Quest Terminal"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    gemini_model_fallback: str = "gemini-2.5-flash-lite"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://dnd-ai-app.vercel.app",
    ]
    database_url: str = "sqlite:///./app.db"
    sql_echo: bool = False

    secret_key: str = "change-me-super-secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    # Optional: create first account on startup when no users exist
    bootstrap_admin_username: str = ""
    bootstrap_admin_password: str = ""

    # When false, /auth/register is disabled; new users submit access requests instead
    registration_open: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
