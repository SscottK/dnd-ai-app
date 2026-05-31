from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Gemini Proxy"
    gemini_api_key: str = ""
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://dnd-ai-app.vercel.app/",

    ]
    shared_app_password: str = "change-me"
    database_url: str = "sqlite:///./app.db"
    
    secret_key: str = "change-me-super-secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()