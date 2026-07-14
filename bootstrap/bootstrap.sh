#!/usr/bin/env bash
# ============================================================================
#  bootstrap.sh - Dung ca cum lab CI/CD tren may 150 (WSL2/Docker) bang k3d.
#  Chay: cd cicd-k8s-lab && REPO_URL=https://github.com/<you>/cicd-k8s-lab.git ./bootstrap/bootstrap.sh
#  Idempotent: chay lai duoc, khong tao trung.
#  Yeu cau: docker dang chay. Script tu cai kubectl/helm/k3d neu thieu.
# ============================================================================
set -euo pipefail

CLUSTER="lab"
REGISTRY_NAME="k3d-registry.localhost"
REGISTRY_PORT="5000"
REPO_URL="${REPO_URL:-https://github.com/CHANGE_ME/cicd-k8s-lab.git}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

info(){ printf '\033[36m[%s] %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

# --- 0) Kiem tra docker ------------------------------------------------------
docker info >/dev/null 2>&1 || { echo "Docker chua chay. Bat Docker Desktop / dockerd trong WSL truoc."; exit 1; }

# --- 1) Cai cong cu neu thieu ------------------------------------------------
if ! have kubectl; then info "Cai kubectl"; curl -sfLO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"; chmod +x kubectl; sudo mv kubectl /usr/local/bin/; fi
if ! have helm;    then info "Cai helm";    curl -sfL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash; fi
if ! have k3d;     then info "Cai k3d";     curl -sfL https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash; fi

# --- 2) Registry rieng (k3d) -------------------------------------------------
if ! k3d registry list 2>/dev/null | grep -q "$REGISTRY_NAME"; then
  info "Tao registry rieng $REGISTRY_NAME:$REGISTRY_PORT"
  k3d registry create "${REGISTRY_NAME#k3d-}" --port "$REGISTRY_PORT"
fi
# de host va cluster cung goi duoc ten registry
grep -q "$REGISTRY_NAME" /etc/hosts || echo "127.0.0.1 $REGISTRY_NAME" | sudo tee -a /etc/hosts >/dev/null

# --- 3) Cluster k3d (disable traefik -> dung ingress-nginx) ------------------
if ! k3d cluster list 2>/dev/null | grep -q "^$CLUSTER"; then
  info "Tao cluster k3d '$CLUSTER' (map cong 8080->80, 8443->443)"
  k3d cluster create "$CLUSTER" \
    --registry-use "${REGISTRY_NAME}:${REGISTRY_PORT}" \
    --port "8080:80@loadbalancer" \
    --port "8443:443@loadbalancer" \
    --k3s-arg "--disable=traefik@server:0" \
    --wait
fi
kubectl config use-context "k3d-$CLUSTER"
kubectl cluster-info

# --- 4) Ingress-nginx --------------------------------------------------------
info "Cai ingress-nginx"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update >/dev/null
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer \
  --wait --timeout 5m

# --- 5) Argo CD --------------------------------------------------------------
info "Cai Argo CD"
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl -n argocd rollout status deploy/argocd-server --timeout=5m
# Ingress cho UI Argo (argocd.localhost:8080). Tat TLS noi bo cho don gian lab.
kubectl -n argocd patch configmap argocd-cmd-params-cm --type merge -p '{"data":{"server.insecure":"true"}}'
kubectl -n argocd rollout restart deploy/argocd-server
cat <<'ING' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: argocd-server, namespace: argocd, annotations: { nginx.ingress.kubernetes.io/backend-protocol: HTTP } }
spec:
  ingressClassName: nginx
  rules:
    - host: argocd.localhost
      http: { paths: [ { path: /, pathType: Prefix, backend: { service: { name: argocd-server, port: { number: 80 } } } } ] }
ING

# --- 6) Monitoring (kube-prometheus-stack) ----------------------------------
info "Cai Prometheus + Grafana"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update >/dev/null
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  --set grafana.service.type=ClusterIP \
  --set 'grafana.ingress.enabled=true' \
  --set 'grafana.ingress.ingressClassName=nginx' \
  --set 'grafana.ingress.hosts[0]=grafana.localhost' \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \
  --wait --timeout 8m

# --- 7) Argo CD Application cho lab-app --------------------------------------
info "Dang ky Argo CD Application (repo: $REPO_URL)"
sed "s#https://github.com/CHANGE_ME/cicd-k8s-lab.git#${REPO_URL}#" "$HERE/argocd/application.yaml" | kubectl apply -f -

# --- 8) In thong tin truy cap -----------------------------------------------
ARGO_PWD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d 2>/dev/null || echo '(chua san sang)')
GRAFANA_PWD=$(kubectl -n monitoring get secret monitoring-grafana -o jsonpath='{.data.admin-password}' | base64 -d 2>/dev/null || echo 'prom-operator')
cat <<EOF

============================================================
 LAB SAN SANG. Them vao /etc/hosts (Windows: C:\\Windows\\System32\\drivers\\etc\\hosts):
   127.0.0.1 lab-app.localhost argocd.localhost grafana.localhost $REGISTRY_NAME

 Truy cap (qua ingress, cong 8080):
   App      : http://lab-app.localhost:8080/
   Argo CD  : http://argocd.localhost:8080/     admin / $ARGO_PWD
   Grafana  : http://grafana.localhost:8080/    admin / $GRAFANA_PWD

 Vong CI/CD: sua app/ -> push main -> CI build+push image + bump manifest
             -> Argo CD tu sync -> pod moi. Xem tan mat o Argo UI.
============================================================
EOF
