# Legacy: nginx-only frontend. Prefer repo-root Dockerfile (FE + BE unified on Cloud Run).
# Build stage (VITE_API_URL baked in at build time for Cloud Build)
FROM node:18-alpine as build
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy the built Vite static files
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
