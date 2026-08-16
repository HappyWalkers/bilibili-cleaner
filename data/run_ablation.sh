#!/bin/bash
# Runs both ablation arms back to back and prints a final comparison.
set -e
cd "$(dirname "$0")"
PY=/tmp/claude-1000/-home-yunpeng/147de553-b9d2-4b0f-80b0-8c889225357e/scratchpad/train-env/bin/python

echo "=== leakage check before any training ==="
python3 check_leakage.py

echo
echo "=== ARM 1: bilibili only ==="
$PY train_student.py --sources bilibili --out student_model_bilibili_only 2>&1 | tee train_bilibili_only.log

echo
echo "=== ARM 2: bilibili + cnspoil ==="
$PY train_student.py --sources bilibili,cnspoil --out student_model_combined 2>&1 | tee train_combined.log

echo
echo "=== COMPARISON ==="
echo "bilibili-only best epoch (val_loss-selected), reported test AUC:"
grep "selected epoch" -A0 train_bilibili_only.log
grep "epoch " train_bilibili_only.log | tail -1
echo
echo "combined best epoch (val_loss-selected), reported test AUC:"
grep "selected epoch" -A0 train_combined.log
grep "epoch " train_combined.log | tail -1
