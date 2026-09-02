FROM nginx:alpine

# Single static "coming soon" page for roamola.com.
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
