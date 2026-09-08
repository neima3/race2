FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN rm -f package-lock.json && npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
