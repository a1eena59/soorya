"""Train a RandomForest on 7-day features -> models/model.pkl + models/metrics.json.

Run `python train.py`.

Honest evaluation:
  - Metrics come from 5-fold cross-validation grouped by SYSTEM, so the model is
    always scored on roofs it never saw during training.
  - The demo hero system (id 1) is left out of training completely.
"""
import json

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import GroupKFold, cross_val_predict

from config import MODELS_DIR
from features import CLASSES, FEATURES, attach_labels, build_features

HERO_ID = 1
MODEL_PATH = MODELS_DIR / "model.pkl"
METRICS_PATH = MODELS_DIR / "metrics.json"


def make_model():
    return RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=5,
        class_weight="balanced",     # faults are rare compared to healthy days
        n_jobs=-1,
        random_state=42,
    )


def train():
    df = attach_labels(build_features())
    train_df = df[df["system_id"] != HERO_ID]
    X, y, groups = train_df[FEATURES], train_df["label"], train_df["system_id"]

    oof = cross_val_predict(make_model(), X, y, groups=groups, cv=GroupKFold(n_splits=5))
    report = classification_report(y, oof, labels=CLASSES, output_dict=True, zero_division=0)
    cm = confusion_matrix(y, oof, labels=CLASSES)

    model = make_model().fit(X, y)
    MODELS_DIR.mkdir(exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    # Hero: completely unseen roof
    hero = df[df["system_id"] == HERO_ID]
    hero_acc = accuracy_score(hero["label"], model.predict(hero[FEATURES]))

    importance = sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1])
    metrics = {
        "rows": int(len(train_df)),
        "systems": int(groups.nunique()),
        "accuracy": round(accuracy_score(y, oof), 4),
        "hero_accuracy": round(hero_acc, 4),
        "classes": CLASSES,
        "per_class": {
            c: {k: round(report[c][k], 4) for k in ("precision", "recall", "f1-score", "support")}
            for c in CLASSES
        },
        "confusion_matrix": cm.tolist(),
        "feature_importance": [{"feature": f, "importance": round(float(v), 4)} for f, v in importance],
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    return metrics


def load_model():
    return joblib.load(MODEL_PATH)


def load_metrics():
    return json.loads(METRICS_PATH.read_text())


if __name__ == "__main__":
    m = train()
    print(f"Trained on {m['rows']} system-days from {m['systems']} systems (hero excluded)")
    print(f"Cross-validated accuracy (unseen roofs): {m['accuracy']:.1%}")
    print(f"Hero system accuracy (never trained on): {m['hero_accuracy']:.1%}\n")
    print(f"{'class':16}{'precision':>10}{'recall':>8}{'support':>9}")
    for c, v in m["per_class"].items():
        print(f"{c:16}{v['precision']:>10.2f}{v['recall']:>8.2f}{int(v['support']):>9}")
    print("\nConfusion matrix (rows = truth, cols = predicted):")
    print(" " * 16 + "".join(f"{c[:8]:>10}" for c in CLASSES))
    for c, row in zip(CLASSES, m["confusion_matrix"]):
        print(f"{c:16}" + "".join(f"{v:>10}" for v in row))
    print("\nTop features:")
    for f in m["feature_importance"][:6]:
        print(f"  {f['feature']:24}{f['importance']:.3f}")
