#!/usr/bin/env bash
# Xoa sach lab (cluster + registry). Chay khi muon lam lai tu dau.
set -euo pipefail
k3d cluster delete lab 2>/dev/null || true
k3d registry delete k3d-registry.localhost 2>/dev/null || true
echo "Da xoa cluster 'lab' + registry. /etc/hosts giu nguyen (xoa tay neu muon)."
