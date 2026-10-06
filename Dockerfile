FROM python:3.11-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/data ./data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM node:20-bookworm-slim AS mailer

WORKDIR /app/mailer
COPY backend/mailer/package.json backend/mailer/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/mailer/server.js ./server.js
EXPOSE 8025
CMD ["npm", "start"]

FROM node:20-bookworm-slim AS frontend

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG BACKEND_INTERNAL_URL=http://backend:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL} \
    HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["npm", "run", "dev"]
