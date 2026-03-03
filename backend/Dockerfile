# Use official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Expose port (Optional for Railway, but good for local)
EXPOSE 8000

# Run the application using the PORT variable provided by Railway (defaulting to 8000)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
