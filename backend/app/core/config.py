from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""  # local .env often stores the anon key as SUPABASE_KEY
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    # Comma-separated emails that can open /api/admin (Lucifer by default).
    super_admin_email: str = "lucifer@gmail.com"
    tmdb_api_key: str = ""
    youtube_api_key: str = ""
    nvidia_api_key: str = ""
    # Local PornhwaDB JSON export (gitignored). Copy pornhwa-export.json here for manhwa catalogue search.
    pornhwadb_data_path: str = "data/pornhwa-export.json"
    # Optional HTTPS URL — downloaded on API startup if the file is missing (Render / ephemeral disk).
    pornhwadb_data_url: str = ""
    # Optional Supabase Storage object (private bucket + service role on the API).
    pornhwadb_storage_bucket: str = ""
    pornhwadb_storage_object: str = "pornhwa-export.json"
    # Comma-separated list, e.g. "http://localhost:5173,https://otakuvault.vercel.app"
    frontend_origin: str = "http://localhost:5173"
    # Optional regex for Vercel preview URLs, e.g. "https://otaku-valult-.*\.vercel\.app"
    # Production + git preview URLs, e.g. otaku-valult-git-main-….vercel.app
    frontend_origin_regex: str = r"https://otaku-valult.*\.vercel\.app"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
