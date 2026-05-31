# app/core/logging_config.py
import logging
import sys

def setup_logging():
    logging_format = (
        "[%(asctime)s] %(levelname)s [%(name)s:%(lineno)s] - %(message)s"
    )
    
    logging.basicConfig(
        level=logging.INFO,
        format=logging_format,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    # Minimize noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("aiosqlite").setLevel(logging.WARNING)