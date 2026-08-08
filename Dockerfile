FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY deploy/default.conf /etc/nginx/conf.d/default.conf
COPY index.html favicon.svg favicon.ico favicon.png site.webmanifest /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
