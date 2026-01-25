FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV MONGODB_URI=mongodb://harx:ix5S3vU6BjKn4MHp@207.180.226.2:27017/V25_HarxPreProd
ENV FRONTEND_URL=https://preprod-knowledge-base.harx.ai
ENV QIANKUN_FRONT_URL=https://v25-preprod.harx.ai
ENV PORT=3001
ENV OPENAI_API_KEY=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
ENV NODE_ENV=development
ENV LOG_LEVEL=info
ENV CORS_ORIGIN=*
ENV MAX_UPLOAD_SIZE=10
ENV FINE_TUNING_MODEL=gpt-3.5-turbo
ENV DOCUMENT_STORAGE_PATH=./uploads
ENV CLOUDINARY_CLOUD_NAME=dyqg8x26j
ENV CLOUDINARY_API_KEY=981166483223979
ENV CLOUDINARY_API_SECRET=i3nxRvfOF1jjfLzMHKE8mP4aXVM
# Vertex AI Configuration
ENV GOOGLE_CLOUD_PROJECT=harx-technologies-inc
ENV GOOGLE_APPLICATION_CREDENTIALS=./config/vertex-ai-key.json
ENV VERTEX_AI_LOCATION=us-central1
ENV VERTEX_AI_MODEL=gemini-2.0-flash-lite
ENV GIGS_API_URL=https://preprod-api-gigsmanual.harx.ai/api

# Test Configuration
ENV API_URL=https://preprod-api-knowledge-base.harx.ai
ENV TEST_COMPANY_ID=67d18e2b319c11009f4f2a98 

EXPOSE 3001

CMD ["sh", "-c", "npm run migrate:scripts-status && npm start"]
