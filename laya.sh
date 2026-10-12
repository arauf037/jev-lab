# 1. Configure the local network environment variables
export LAYA_HOST=127.0.0.1
export LAYA_PORT=8000

# 2. Target the dedicated NVIDIA RTX 4050 GPU
export LAYA_DEVICE=cuda

# 3. Specify the specialized checkpoint for your flight lab rules
export LAYA_MODELS=typed-decisions
export LAYA_PRELOAD=1

# 4. Fire up the FastAPI server (POST /v1/systemone) using the local runtime venv
exec /var/www/html/laya-runtime/.venv/bin/laya-serve
