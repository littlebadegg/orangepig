# 将 SSL 证书放在此目录：
#   - fullchain.pem  (证书链)
#   - privkey.pem    (私钥)
#
# 使用 Let's Encrypt 免费证书：
#   certbot certonly --standalone -d your-domain.com
#   cp /etc/letsencrypt/live/your-domain.com/fullchain.pem .
#   cp /etc/letsencrypt/live/your-domain.com/privkey.pem .
#
# 然后取消 nginx/conf.d/orangepig.conf 中 HTTPS server 块的注释
