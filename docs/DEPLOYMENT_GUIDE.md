# Deployment Guide

Complete guide for deploying the Earthquake Catalogue Platform to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Production Build](#production-build)
5. [Docker Deployment](#docker-deployment)
6. [Manual Deployment](#manual-deployment)
7. [Reverse Proxy Setup](#reverse-proxy-setup)
8. [SSL/TLS Configuration](#ssltls-configuration)
9. [Monitoring & Logging](#monitoring--logging)
10. [Backup & Recovery](#backup--recovery)
11. [Performance Tuning](#performance-tuning)
12. [Security Hardening](#security-hardening)

---

## Prerequisites

### System Requirements

**Minimum**:
- CPU: 2 cores
- RAM: 2 GB
- Disk: 10 GB
- OS: Linux (Ubuntu 20.04+ recommended)

**Recommended**:
- CPU: 4 cores
- RAM: 4 GB
- Disk: 50 GB SSD
- OS: Linux (Ubuntu 22.04 LTS)

### Software Requirements

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **SQLite3**: 3.x
- **Git**: For deployment from repository
- **Nginx** or **Apache**: For reverse proxy (optional but recommended)

---

## Environment Setup

### 1. Create Environment File

Create `.env.local` in the project root:

```env
# Application
NODE_ENV=production
PORT=3000

# Database
DATABASE_PATH=/var/lib/earthquake-catalogue/merged_catalogues.db

# GeoNet API
GEONET_API_URL=https://service.geonet.org.nz/fdsnws/event/1/query

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/earthquake-catalogue/app.log

# Performance
MAX_EVENTS_PER_PAGE=100
CACHE_TTL=300000

# Security (if implementing authentication)
# JWT_SECRET=your-secret-key-here
# SESSION_SECRET=your-session-secret-here
```

### 2. Set File Permissions

```bash
# Create application user
sudo useradd -r -s /bin/false earthquake-catalogue

# Set ownership
sudo chown -R earthquake-catalogue:earthquake-catalogue /opt/earthquake-catalogue

# Set permissions
sudo chmod 755 /opt/earthquake-catalogue
sudo chmod 644 /opt/earthquake-catalogue/.env.local
```

---

## Database Setup

### 1. Initialize Database

```bash
# Create database directory
sudo mkdir -p /var/lib/earthquake-catalogue
sudo chown earthquake-catalogue:earthquake-catalogue /var/lib/earthquake-catalogue

# Initialize database
cd /opt/earthquake-catalogue
npm run tsx scripts/init-database.ts
```

### 2. Run Migrations

```bash
# Run all migrations in order
node scripts/migrate-add-source-id.js
node scripts/migrate-add-geo-bounds.js
node scripts/migrate-add-region.ts
node scripts/migrate-add-metadata-fields.js
```

### 3. Verify Database

```bash
# Check database file exists
ls -lh /var/lib/earthquake-catalogue/merged_catalogues.db

# Verify schema
sqlite3 /var/lib/earthquake-catalogue/merged_catalogues.db ".schema"
```

### 4. Set Database Permissions

```bash
sudo chown earthquake-catalogue:earthquake-catalogue /var/lib/earthquake-catalogue/merged_catalogues.db
sudo chmod 644 /var/lib/earthquake-catalogue/merged_catalogues.db
```

---

## Production Build

### 1. Clone Repository

```bash
cd /opt
sudo git clone https://git.gns.cri.nz/earthquake/catalogofcatalogs.git earthquake-catalogue
cd earthquake-catalogue
```

### 2. Install Dependencies

```bash
# Install production dependencies only
npm ci --production

# Or install all dependencies if you need dev tools
npm ci
```

### 3. Build Application

```bash
# Build Next.js application
npm run build

# Verify build
ls -lh .next
```

### 4. Test Production Build

```bash
# Start production server
npm start

# Test in another terminal
curl http://localhost:3000/api/ready
```

---

## Docker Deployment

### 1. Build Docker Image

**Dockerfile** (already included in project):

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application files
COPY . .

# Build application
RUN npm run build

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/merged_catalogues.db

# Start application
CMD ["npm", "start"]
```

Build the image:

```bash
docker build -t earthquake-catalogue:latest .
```

### 2. Run Docker Container

```bash
# Create data volume
docker volume create earthquake-data

# Run container
docker run -d \
  --name earthquake-catalogue \
  -p 3000:3000 \
  -v earthquake-data:/app/data \
  --restart unless-stopped \
  earthquake-catalogue:latest
```

### 3. Docker Compose

**docker-compose.yml** (already included in project):

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - earthquake-data:/app/data
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/merged_catalogues.db
    restart: unless-stopped

volumes:
  earthquake-data:
```

Deploy with Docker Compose:

```bash
docker-compose up -d
```

### 4. Verify Deployment

```bash
# Check container status
docker ps

# View logs
docker logs earthquake-catalogue

# Test API
curl http://localhost:3000/api/ready
```

---

## Manual Deployment

### 1. Install as Systemd Service

Create `/etc/systemd/system/earthquake-catalogue.service`:

```ini
[Unit]
Description=Earthquake Catalogue Platform
After=network.target

[Service]
Type=simple
User=earthquake-catalogue
WorkingDirectory=/opt/earthquake-catalogue
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/earthquake-catalogue/app.log
StandardError=append:/var/log/earthquake-catalogue/error.log

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable earthquake-catalogue

# Start service
sudo systemctl start earthquake-catalogue

# Check status
sudo systemctl status earthquake-catalogue
```

### 3. Manage Service

```bash
# Stop service
sudo systemctl stop earthquake-catalogue

# Restart service
sudo systemctl restart earthquake-catalogue

# View logs
sudo journalctl -u earthquake-catalogue -f
```

---

## Reverse Proxy Setup

### Nginx Configuration

Create `/etc/nginx/sites-available/earthquake-catalogue`:

```nginx
upstream earthquake_catalogue {
    server localhost:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name earthquake.example.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name earthquake.example.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/earthquake.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/earthquake.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Logging
    access_log /var/log/nginx/earthquake-catalogue-access.log;
    error_log /var/log/nginx/earthquake-catalogue-error.log;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Proxy settings
    location / {
        proxy_pass http://earthquake_catalogue;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files caching
    location /_next/static {
        proxy_pass http://earthquake_catalogue;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://earthquake_catalogue;
    }
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

Enable the site:

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/earthquake-catalogue /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## SSL/TLS Configuration

### Using Let's Encrypt

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d earthquake.example.com

# Test auto-renewal
sudo certbot renew --dry-run
```

### Manual Certificate

If using a custom certificate:

```bash
# Copy certificate files
sudo cp fullchain.pem /etc/ssl/certs/earthquake-catalogue.crt
sudo cp privkey.pem /etc/ssl/private/earthquake-catalogue.key

# Set permissions
sudo chmod 644 /etc/ssl/certs/earthquake-catalogue.crt
sudo chmod 600 /etc/ssl/private/earthquake-catalogue.key
```

---

## Monitoring & Logging

### Application Logs

```bash
# Create log directory
sudo mkdir -p /var/log/earthquake-catalogue
sudo chown earthquake-catalogue:earthquake-catalogue /var/log/earthquake-catalogue

# View logs
sudo tail -f /var/log/earthquake-catalogue/app.log
sudo tail -f /var/log/earthquake-catalogue/error.log
```

### Log Rotation

Create `/etc/logrotate.d/earthquake-catalogue`:

```
/var/log/earthquake-catalogue/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 earthquake-catalogue earthquake-catalogue
    sharedscripts
    postrotate
        systemctl reload earthquake-catalogue > /dev/null 2>&1 || true
    endscript
}
```

### Health Monitoring

Set up a cron job to check health:

```bash
# Create health check script
cat > /usr/local/bin/check-earthquake-catalogue.sh << 'EOF'
#!/bin/bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/ready)
if [ "$RESPONSE" != "200" ]; then
    echo "Health check failed with status $RESPONSE"
    systemctl restart earthquake-catalogue
    # Send alert email
    echo "Earthquake Catalogue service restarted" | mail -s "Service Alert" admin@example.com
fi
EOF

# Make executable
sudo chmod +x /usr/local/bin/check-earthquake-catalogue.sh

# Add to crontab
sudo crontab -e
# Add line:
# */5 * * * * /usr/local/bin/check-earthquake-catalogue.sh
```

---

## Backup & Recovery

### Database Backup

```bash
# Create backup script
cat > /usr/local/bin/backup-earthquake-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/earthquake-catalogue"
DB_PATH="/var/lib/earthquake-catalogue/merged_catalogues.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
sqlite3 $DB_PATH ".backup $BACKUP_DIR/catalogue_$DATE.db"
gzip $BACKUP_DIR/catalogue_$DATE.db

# Keep only last 30 days
find $BACKUP_DIR -name "catalogue_*.db.gz" -mtime +30 -delete
EOF

# Make executable
sudo chmod +x /usr/local/bin/backup-earthquake-db.sh

# Schedule daily backup
sudo crontab -e
# Add line:
# 0 2 * * * /usr/local/bin/backup-earthquake-db.sh
```

### Restore from Backup

```bash
# Stop service
sudo systemctl stop earthquake-catalogue

# Restore database
gunzip -c /var/backups/earthquake-catalogue/catalogue_20241024_020000.db.gz > /var/lib/earthquake-catalogue/merged_catalogues.db

# Set permissions
sudo chown earthquake-catalogue:earthquake-catalogue /var/lib/earthquake-catalogue/merged_catalogues.db

# Start service
sudo systemctl start earthquake-catalogue
```

---

## Performance Tuning

### Node.js Optimization

```bash
# Increase memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Enable production mode
export NODE_ENV=production
```

### Database Optimization

```sql
-- Analyze database
ANALYZE;

-- Vacuum database
VACUUM;

-- Check integrity
PRAGMA integrity_check;
```

### Caching

Enable caching in `.env.local`:

```env
CACHE_TTL=300000  # 5 minutes
ENABLE_CACHE=true
```

---

## Security Hardening

### Firewall Configuration

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### Security Headers

Add to Nginx configuration:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
```

### Regular Updates

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade

# Update Node.js dependencies
npm audit
npm audit fix

# Update application
cd /opt/earthquake-catalogue
git pull
npm ci --production
npm run build
sudo systemctl restart earthquake-catalogue
```

---

*Last Updated: October 2024*
