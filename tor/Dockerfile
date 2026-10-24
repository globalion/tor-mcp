# Small alpine-based Tor daemon. Runs as unprivileged user, exposes SOCKS5
# on 9050 and control port on 9051 (password-protected).
FROM alpine:3.19

RUN apk add --no-cache tor tini curl

COPY torrc /etc/tor/torrc
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && chown -R tor:tor /var/lib/tor /var/log/tor

USER tor
EXPOSE 9050 9051

# tini as PID 1 so `docker stop` cleanly shuts down Tor
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
