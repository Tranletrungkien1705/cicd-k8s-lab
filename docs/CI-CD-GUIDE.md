# CI/CD + Kubernetes (GitOps) — Tài liệu học đầy đủ

> Tài liệu này giải thích **toàn bộ** hệ thống trong repo `cicd-k8s-lab`: khái niệm → công nghệ →
> luồng chạy → cách tự dựng từ số 0 → vận hành → sự cố thường gặp. Đọc từ trên xuống là hiểu và làm lại được.

**Live demo:** https://cicd-k8s-lab-demo.onrender.com/ · **Portfolio:** https://tranletrungkien1705.github.io/

---

## 0. Hệ thống này là gì?

Một **pipeline CI/CD hiện đại hoàn chỉnh**, thu nhỏ nhưng đủ 5 mảnh của thực tế:

```
CI  →  Registry  →  GitOps  →  Kubernetes  →  Monitoring
```

Mục tiêu cuối: **sửa code → `git push` → phần còn lại TỰ ĐỘNG** cho tới khi phiên bản mới chạy trên
Kubernetes, không ai gõ lệnh deploy tay.

---

## 1. Các khái niệm nền tảng (đọc kỹ phần này trước)

### 1.1. CI — Continuous Integration (Tích hợp liên tục)
Mỗi khi có code mới, **tự động**: lấy code → cài phụ thuộc → **chạy test** → **build** thành sản phẩm
(ở đây là *Docker image*). Mục đích: phát hiện lỗi sớm, luôn có bản build sạch. Công cụ: **GitHub Actions**.

### 1.2. CD — Continuous Delivery / Deployment
- **Delivery**: sau CI, sản phẩm luôn *sẵn sàng* để phát hành (chỉ cần bấm nút / tạo tag).
- **Deployment**: đi thêm một bước — **tự động phát hành luôn** ra môi trường chạy.
Repo này làm **Deployment tự động** qua GitOps.

### 1.3. Container & Image & Registry
- **Container**: một "hộp" đóng gói app + toàn bộ thứ nó cần (runtime, thư viện) → chạy giống nhau ở mọi máy.
- **Image**: khuôn để tạo container (bất biến, có tag/phiên bản). Tạo bằng `Dockerfile`.
- **Registry**: kho chứa image (như "GitHub cho image"). Ở đây dùng **registry riêng của k3d**.

### 1.4. Kubernetes (k8s) — hệ điều hành cho container
Chạy & quản lý container ở quy mô lớn. Các đối tượng dùng trong repo:
| Đối tượng | Vai trò |
|---|---|
| **Pod** | Đơn vị nhỏ nhất — 1+ container chạy cùng nhau |
| **Deployment** | Quản lý N bản sao (replica) của Pod, lo **rolling update** (thay bản mới không downtime) |
| **Service** | Địa chỉ mạng ổn định để gọi các Pod (Pod sinh/tử liên tục, IP đổi) |
| **Ingress** | Cổng vào HTTP từ ngoài → route theo hostname/path tới Service |
| **liveness/readiness probe** | k8s tự kiểm tra sức khoẻ: `liveness` fail → restart Pod; `readiness` fail → ngừng gửi traffic |
| **Rolling update** | Thay Pod cũ bằng Pod mới **từ từ**, luôn còn bản chạy → **zero-downtime** |

### 1.5. GitOps — Git là "nguồn sự thật duy nhất"
Trạng thái mong muốn của hệ thống (file manifest YAML) **nằm trong Git**. Một công cụ (**Argo CD**) liên tục
so sánh *Git* với *cluster thật*, thấy lệch thì **tự đồng bộ** cluster về đúng Git.
- Ưu điểm: mọi thay đổi đều qua Git (có lịch sử, review, revert). **Rollback = `git revert`**.
- Khác biệt cốt lõi vs cách cũ: **KHÔNG ai `kubectl apply` tay**. CI chỉ *ghi vào Git*, Argo *đọc từ Git*.

### 1.6. Observability (khả năng quan sát)
- **Prometheus**: thu thập số liệu (metrics) từ app (endpoint `/metrics`).
- **Grafana**: vẽ biểu đồ từ số liệu đó. → "nhìn thấy" hệ thống đang chạy thế nào.

---

## 2. Công nghệ dùng & vì sao chọn

| Công nghệ | Vai trò | Vì sao |
|---|---|---|
| **GitHub Actions** | CI (test + build + push image + bump manifest) | Miễn phí repo public, tích hợp sẵn GitHub |
| **Docker** | Đóng gói app thành image | Chuẩn container phổ biến nhất |
| **k3d** (k3s-in-Docker) | Chạy Kubernetes gọn nhẹ trên máy cá nhân | Nhẹ, 1 lệnh dựng, né rắc rối cài k8s thật |
| **Registry riêng (k3d)** | Kho image nội bộ cluster | Không phụ thuộc Docker Hub |
| **ingress-nginx** | Cổng HTTP vào cluster | Chuẩn công nghiệp |
| **Argo CD** | GitOps — tự đồng bộ Git → cluster | Công cụ GitOps phổ biến nhất |
| **kube-prometheus-stack** | Prometheus + Grafana | Bộ monitoring chuẩn cho k8s |
| **Node.js / Express** | App mẫu (có `/healthz`, `/metrics`) | Nhẹ, dễ đọc để tập trung học pipeline |

---

## 3. Luồng chạy chi tiết (điều xảy ra khi bạn `git push`)

```
[1] Bạn sửa code trong app/ và:  git push origin main
        │
        ▼
[2] GitHub Actions (.github/workflows/ci.yml) chạy trên runner:
        a. npm test                      (kiểm thử)
        b. docker build → image :<sha>   (đóng gói)
        c. docker push → registry        (đưa image vào kho)
        d. sed sửa tag image trong deploy/app/deployment.yaml
           → git commit "ci: deploy ...:<sha> [skip ci]" → git push
        │   (⚠ [skip ci] để commit này KHÔNG kích CI lần nữa → tránh lặp vô hạn)
        ▼
[3] Argo CD (chạy trong cluster) theo dõi thư mục deploy/app/ trong Git:
        - Phát hiện commit mới (tag image đổi)
        - So sánh Git vs cluster → thấy lệch → SYNC
        │
        ▼
[4] Kubernetes nhận manifest mới:
        - Deployment tạo ReplicaSet mới với image :<sha>
        - Rolling update: bật Pod mới → chờ readiness OK → tắt Pod cũ
        │   (luôn còn Pod phục vụ → không downtime)
        ▼
[5] Ingress-nginx route traffic tới Pod mới → phiên bản mới LIVE
        Prometheus scrape /metrics → Grafana vẽ biểu đồ
```

**Rollback**: `git revert` commit bump-tag → Argo thấy Git đổi → tự kéo cluster về image cũ.

---

## 4. Cách tự dựng từ số 0

### 4.1. Chuẩn bị (máy Linux / WSL2 có Docker)
```bash
# Cần: docker đang chạy. Script tự cài kubectl, helm, k3d nếu thiếu.
git clone https://github.com/Tranletrungkien1705/cicd-k8s-lab.git
cd cicd-k8s-lab
```

### 4.2. Dựng cả cụm bằng 1 script
```bash
REPO_URL=https://github.com/<bạn>/cicd-k8s-lab.git ./bootstrap/bootstrap.sh
```
Script `bootstrap/bootstrap.sh` làm tuần tự (đọc file để hiểu từng bước):
1. Cài `kubectl`, `helm`, `k3d` (nếu thiếu).
2. Tạo **registry riêng** `k3d-registry.localhost:5000`.
3. Tạo **cluster k3d** (`--disable=traefik` để dùng ingress-nginx), map cổng `8080:80`.
4. Cài **ingress-nginx** (Helm).
5. Cài **Argo CD** (`kubectl apply --server-side` — CRD quá lớn cho client-side).
6. Cài **kube-prometheus-stack** (Prometheus + Grafana).
7. Đăng ký **Argo CD Application** trỏ vào `deploy/app/` → Argo bắt đầu tự sync.

### 4.3. Build & đẩy image lần đầu
```bash
cd app
docker build -t k3d-registry.localhost:5000/lab-app:latest .
docker push k3d-registry.localhost:5000/lab-app:latest
# (⚠ nếu báo "HTTP response to HTTPS client": push qua localhost:5000 thay vì tên k3d-registry.localhost)
```

### 4.4. Nối CI tự động (để full auto)
Cài **GitHub self-hosted runner** (label `k3d-150`) trong WSL — vì runner cần thấy `docker` + registry của k3d:
```bash
# GitHub repo → Settings → Actions → Runners → New self-hosted runner (Linux)
# khi hỏi labels: thêm  k3d-150 ; cài chạy như service:
sudo ./svc.sh install && sudo ./svc.sh start
```
Từ đó: sửa `app/` → `git push` → toàn bộ luồng ở Mục 3 tự chạy.

### 4.5. Truy cập
Thêm vào `/etc/hosts`: `127.0.0.1 lab-app.localhost argocd.localhost grafana.localhost`
- App: http://lab-app.localhost:8080/
- Argo CD: http://argocd.localhost:8080/ (mật khẩu: `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d`)
- Grafana: http://grafana.localhost:8080/ (`admin` / xem secret `monitoring-grafana`)

---

## 5. Vận hành hằng ngày

| Việc | Lệnh / cách |
|---|---|
| Deploy phiên bản mới | Sửa `app/` → `git push` (CI + Argo tự lo) |
| Xem lịch sử CI/CD | Tab **Actions** của repo, hoặc mục "CI/CD Activity" trên portfolio |
| Xem trạng thái deploy | Argo CD UI (Synced / Healthy) |
| Rollback | `git revert <commit bump-tag>` → push |
| Xem biểu đồ app | Grafana |
| Xem Pod đang chạy | `kubectl -n lab get pods` |

---

## 6. Các sự cố đã gặp & bài học (rất đáng đọc)

1. **YAML `${{ }}` trong flow-mapping `{ }`** → cặp `}}` xung đột dấu `}` đóng mapping → workflow
   **startup_failure** (run có `jobs:[]`). *Fix*: viết `with:` kiểu block nhiều dòng, không dùng `{ }`.
2. **`kubectl apply` fail CRD Argo** ("annotation > 262144 bytes"): CRD applicationsets quá lớn cho
   client-side apply. *Fix*: `kubectl apply --server-side --force-conflicts`.
3. **`docker push` báo "HTTP response to HTTPS client"**: docker coi `k3d-registry.localhost:5000` là
   HTTPS. *Fix*: push qua `localhost:5000` (docker cho localhost dùng HTTP) — cùng registry, cluster vẫn
   pull bằng tên `k3d-registry.localhost:5000`.
4. **Job nền chết khi đóng SSH/terminal**: `nohup` không đủ trong WSL. *Fix*: chạy dưới `systemd-run`.
5. **`*.localhost` bị trình duyệt ép về 127.0.0.1**: không truy cập từ máy khác được bằng tên này.
   *Fix cho remote*: đổi host ingress sang `nip.io` (vd `lab-app.<ip>.nip.io`).
6. **Render free "spin down"**: service ngủ sau 15' không traffic → cold-start ~50s. *Giảm*: cron ping
   định kỳ (`.github/workflows/keepalive.yml`).

---

## 7. Mở rộng tiếp (khi đã nắm chắc)
- **Staging + Production**: 2 overlay Kustomize + 2 Argo Application (mô hình app-of-apps).
- **Argo Rollouts**: canary / blue-green (deploy dần, tự rollback khi lỗi).
- **Sealed Secrets / SOPS**: đưa secret vào Git an toàn (mã hoá).
- **Multi-node**: thêm worker node để học scheduling / high-availability.

---

*Tác giả: Trần Lê Trung Kiên — [Portfolio](https://tranletrungkien1705.github.io/) · [GitHub](https://github.com/Tranletrungkien1705)*
