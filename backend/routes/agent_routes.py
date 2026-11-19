"""
agent_routes.py — All agent + auth API endpoints.
"""

"""
agent_routes.py — All agent API endpoints.
Applies guardrail_engine decorator to every route.
"""
from flask import Blueprint, request, jsonify, g
from pydantic import ValidationError

from backend.guardrails.guardrail_engine import guardrailed, run_output_guardrails, run_data_guardrails
from backend.guardrails.input_guardrails import TreeCreateSchema, NLQuerySchema, HealthAssessSchema, validate_file_upload
from backend.guardrails.hitl_guardrails import (
    requires_hitl, hold_for_approval, approve_action,
    reject_action, list_pending_approvals
)
from backend.guardrails.data_guardrails import get_current_role, get_current_user_id, require_role

agent_bp = Blueprint("agent", __name__)


# ── Inventory Agent (Agent 2) ─────────────────────────────────────────────────

@agent_bp.route("/inventory", methods=["GET"])
@guardrailed("inventory_agent")
def get_inventory():
    from backend.agents.inventory_agent import get_all_trees
    ward    = request.args.get("ward", type=int)
    species = request.args.get("species")
    status  = request.args.get("status")
    h_min   = request.args.get("health_min", type=int)
    h_max   = request.args.get("health_max", type=int)
    user_role = g.get("user_role", "citizen")
    trees = get_all_trees(ward=ward, species=species, status=status,
                          health_min=h_min, health_max=h_max, user_role=user_role)
    return jsonify({"trees": trees, "count": len(trees)})


@agent_bp.route("/inventory", methods=["POST"])
@guardrailed("inventory_agent")
@require_role("officer", "admin")
def add_tree():
    from backend.agents.inventory_agent import add_tree
    body = request.get_json(silent=True) or {}
    try:
        validated = TreeCreateSchema(**body)
    except ValidationError as e:
        return jsonify({"status": "blocked", "reason": "schema_validation_failed",
                        "details": e.errors()}), 400
    result = add_tree(validated.dict(), user_id=g.get("user_id", "anonymous"))
    return jsonify(result), 201


@agent_bp.route("/inventory/query", methods=["POST"])
@guardrailed("inventory_agent")
def nl_inventory_query():
    from backend.agents.inventory_agent import nl_to_filters, get_all_trees
    body = request.get_json(silent=True) or {}
    try:
        validated = NLQuerySchema(**body)
    except ValidationError as e:
        return jsonify({"status": "blocked", "reason": "schema_validation_failed",
                        "details": e.errors()}), 400
    user_role = g.get("user_role", "citizen")
    filters = nl_to_filters(validated.query)
    trees = get_all_trees(user_role=user_role, **filters)
    return jsonify({"trees": trees, "count": len(trees), "filters_applied": filters})


@agent_bp.route("/inventory/summary", methods=["GET"])
def inventory_summary():
    from backend.agents.inventory_agent import get_summary
    return jsonify(get_summary())


# ── Health Agent (Agent 1) ────────────────────────────────────────────────────

@agent_bp.route("/health/assess", methods=["POST"])
@guardrailed("health_agent")
def assess_health():
    from backend.agents.health_agent import assess_tree_health

    # File upload validation (Input Guardrail 1)
    image_bytes = None
    if "image" in request.files:
        file = request.files["image"]
        ok, reason = validate_file_upload(file.filename, len(file.read()))
        if not ok:
            return jsonify({"status": "blocked", "reason": reason,
                            "message": "Invalid file upload."}), 400
        file.seek(0)
        image_bytes = file.read()

    # Optional env params
    form = request.form
    ward        = form.get("ward", type=int)
    temperature = form.get("temperature", type=float)
    soil_ph     = form.get("soil_ph", type=float)
    rainfall    = form.get("rainfall", type=float)
    latitude    = form.get("latitude", type=float)
    longitude   = form.get("longitude", type=float)

    response = assess_tree_health(
        image_bytes=image_bytes,
        latitude=latitude, longitude=longitude,
        ward=ward, temperature=temperature,
        soil_ph=soil_ph, rainfall=rainfall,
    )

    # Output guardrails
    response, warnings = run_output_guardrails(response, "health_agent")

    # HITL: if health_score critically low, hold for approval
    if requires_hitl("health_assessment", response):
        return jsonify(hold_for_approval("health_assessment", response))

    return jsonify({**response, "_guardrail_warnings": warnings})


@agent_bp.route("/health/recommend", methods=["POST"])
@guardrailed("health_agent")
def recommend_plantation():
    from backend.agents.health_agent import recommend_plantation
    body = request.get_json(silent=True) or {}
    response = recommend_plantation(
        ward=body.get("ward"),
        temperature=body.get("temperature"),
        rainfall=body.get("rainfall"),
        soil_ph=body.get("soil_ph"),
    )
    response, warnings = run_output_guardrails(response, "health_agent")
    return jsonify({**response, "_guardrail_warnings": warnings})


# ── Mapping Agent (Agent 3) ───────────────────────────────────────────────────

@agent_bp.route("/map/wards", methods=["GET"])
def get_map_wards():
    from backend.agents.mapping_agent import get_wards_geojson
    return jsonify(get_wards_geojson())


@agent_bp.route("/map/deficient", methods=["GET"])
def get_deficient_wards():
    from backend.agents.mapping_agent import get_deficient_wards
    threshold = request.args.get("threshold", default=15.0, type=float)
    return jsonify(get_deficient_wards(threshold))


@agent_bp.route("/live/weather", methods=["GET"])
def get_live_weather():
    from backend.live_data.weather_fetcher import get_latest_weather
    return jsonify(get_latest_weather())


# ── Dashboard Agent (Agent 4) ─────────────────────────────────────────────────

@agent_bp.route("/dashboard/summary", methods=["GET"])
def dashboard_summary():
    from backend.agents.dashboard_agent import get_dashboard_summary
    return jsonify(get_dashboard_summary())


@agent_bp.route("/dashboard/query", methods=["POST"])
@guardrailed("dashboard_agent")
def dashboard_nl_query():
    from backend.agents.dashboard_agent import route_nl_query
    body = request.get_json(silent=True) or {}
    query = body.get("query", "")
    user_role = g.get("user_role", "citizen")
    result = route_nl_query(query, user_role)
    return jsonify(result)


# ── HITL Approval Routes ──────────────────────────────────────────────────────

@agent_bp.route("/approve/<action_id>", methods=["POST"])
@require_role("officer", "admin")
def approve(action_id):
    user_id = get_current_user_id(request)
    result = approve_action(action_id, user_id)
    return jsonify(result)


@agent_bp.route("/reject/<action_id>", methods=["POST"])
@require_role("officer", "admin")
def reject(action_id):
    user_id = get_current_user_id(request)
    result = reject_action(action_id, user_id)
    return jsonify(result)


@agent_bp.route("/pending-approvals", methods=["GET"])
@require_role("officer", "admin")
def pending_approvals():
    return jsonify(list_pending_approvals())


# ── Metrics / LLM Performance Dashboard ──────────────────────────────────────

@agent_bp.route("/metrics", methods=["GET"])
def get_all_metrics():
    from backend.agents.metrics_agent import get_all_metrics
    return jsonify(get_all_metrics())


@agent_bp.route("/metrics/accuracy", methods=["GET"])
def metrics_accuracy():
    from backend.agents.metrics_agent import accuracy_quality_metrics
    return jsonify(accuracy_quality_metrics())


@agent_bp.route("/metrics/rag", methods=["GET"])
def metrics_rag():
    from backend.agents.metrics_agent import rag_metrics
    return jsonify(rag_metrics())


@agent_bp.route("/metrics/agentic", methods=["GET"])
def metrics_agentic():
    from backend.agents.metrics_agent import agentic_metrics
    return jsonify(agentic_metrics())


@agent_bp.route("/metrics/safety", methods=["GET"])
def metrics_safety():
    from backend.agents.metrics_agent import safety_guardrail_metrics
    return jsonify(safety_guardrail_metrics())


@agent_bp.route("/metrics/performance", methods=["GET"])
def metrics_performance():
    from backend.agents.metrics_agent import performance_cost_metrics
    return jsonify(performance_cost_metrics())


@agent_bp.route("/metrics/multiagent", methods=["GET"])
def metrics_multiagent():
    from backend.agents.metrics_agent import multiagent_system_metrics
    return jsonify(multiagent_system_metrics())


# ── Auth: Login endpoint ──────────────────────────────────────────────────────

# Demo credentials — in production use a real user table + bcrypt
DEMO_USERS = {
    "citizen@vanasethu.in":  {"password": "citizen123", "role": "citizen",  "name": "Priya Citizen"},
    "officer@bbmp.gov.in":   {"password": "officer123", "role": "officer",  "name": "Officer Rajan"},
    "admin@bbmp.gov.in":     {"password": "admin123",   "role": "admin",    "name": "Admin Mehta"},
}

@agent_bp.route("/auth/login", methods=["POST"])
def login():
    import os
    from jose import jwt
    body = request.get_json(silent=True) or {}
    email    = body.get("email", "").strip().lower()
    password = body.get("password", "")
    user = DEMO_USERS.get(email)
    if not user or user["password"] != password:
        return jsonify({"status": "error", "message": "Invalid email or password"}), 401
    secret = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    token = jwt.encode(
        {"sub": email, "role": user["role"], "name": user["name"]},
        secret, algorithm="HS256"
    )
    return jsonify({
        "status":  "ok",
        "token":   token,
        "role":    user["role"],
        "name":    user["name"],
        "email":   email,
    })


@agent_bp.route("/auth/me", methods=["GET"])
def me():
    from backend.guardrails.data_guardrails import get_current_role, get_current_user_id, decode_token
    import os
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"role": "citizen", "name": "Guest"}), 200
    token = auth.split(" ", 1)[1]
    secret = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret")
    claims = decode_token(token)
    if not claims:
        return jsonify({"status": "error", "message": "Invalid token"}), 401
    return jsonify({"role": claims.get("role","citizen"), "name": claims.get("name",""), "email": claims.get("sub","")})


@agent_bp.route("/public/stats", methods=["GET"])
def public_stats():
    """Public endpoint — no auth required. Used by citizen landing page."""
    from backend.agents.inventory_agent import get_summary
    from backend.agents.mapping_agent import get_deficient_wards
    from backend.live_data.weather_fetcher import get_latest_weather
    summary  = get_summary()
    deficient = get_deficient_wards(15.0)
    weather   = get_latest_weather()
    return jsonify({
        "total_trees":      summary["total_trees"],
        "avg_health_score": summary["avg_health_score"],
        "maintenance_due":  summary["maintenance_due"],
        "deficient_wards":  len(deficient),
        "weather":          weather,
    })
