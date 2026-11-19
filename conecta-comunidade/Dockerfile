# ---------- Estágio 1: testes (o build falha se algum teste falhar) ----------
FROM node:22-alpine AS teste
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY tests ./tests
RUN npm test

# ---------- Estágio 2: imagem final enxuta ----------
FROM node:22-alpine AS producao
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=teste /app/package.json ./
COPY --from=teste /app/src ./src
COPY --from=teste /app/public ./public
COPY --from=teste /app/scripts ./scripts
# Camada OURO do data lake já processada (o dashboard de Big Data funciona logo ao subir)
COPY --chown=node:node datalake/ouro ./datalake/ouro
RUN mkdir -p /app/datalake/bronze && chown -R node:node /app/datalake

# Segurança: roda como usuário sem privilégios
USER node
EXPOSE 3000

# Monitoramento: o Docker marca o container como unhealthy se /health falhar
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server/index.js"]
