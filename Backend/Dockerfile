### Build stage: install dependencies
FROM node:18-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production

# Install build dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

### Final stage: minimal runtime image
FROM node:18-alpine
WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules and source from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# Default port (can be overridden by env)
ENV PORT=5000
EXPOSE 5000

# Simple healthcheck that queries the /health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD node -e "const http=require('http'); const p=process.env.PORT||5000; http.get({host:'127.0.0.1',port:p,path:'/health'},res=>{if(res.statusCode!==200)process.exit(1)}).on('error',()=>process.exit(1))"

CMD ["node", "Server.js"]
