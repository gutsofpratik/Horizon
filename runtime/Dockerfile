FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive PLAYWRIGHT_BROWSERS_PATH=/ms-playwright PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-dev python3-tk build-essential bash xvfb openbox scrot xclip xauth xdotool wmctrl libreoffice poppler-utils tesseract-ocr tesseract-ocr-eng fonts-dejavu ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/worker
COPY runtime/worker/package*.json ./
RUN npm install --omit=dev && npx playwright install --with-deps chromium
RUN python3 -m pip install --break-system-packages python-docx==1.2.0 openpyxl==3.1.5 python-pptx==1.0.2 reportlab==4.4.4 pypdf==6.1.1 pdfplumber==0.11.7 pandas==2.3.3 matplotlib==3.10.7 Pillow==11.3.0 pypdfium2==4.30.0 pyautogui==0.9.54
COPY runtime/worker/ ./
RUN mkdir -p /workspace && chown node:node /workspace /opt/worker && chmod -R a+rX /ms-playwright
USER node
ENV HOME=/home/node
WORKDIR /workspace
EXPOSE 8787
CMD ["node","/opt/worker/index.mjs"]
