import json
import os
import re
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from decimal import Decimal

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        'body': json.dumps(body, default=decimal_default)
    }

def handler(event, context):
    http_method = event['httpMethod']

    if http_method == 'OPTIONS':
        return cors_response(200, {})

    try:
        path_params = event.get('pathParameters') or {}
        query_params = event.get('queryStringParameters') or {}

        # Get space ID from path or query
        space_id = path_params.get('spaceId') or query_params.get('spaceId')

        if not space_id:
            return cors_response(400, {'error': 'spaceId is required'})

        # Extract space ID from URL if full URL provided
        if 'chat.google.com' in space_id:
            match = re.search(r'/room/([A-Za-z0-9_-]+)', space_id)
            if match:
                space_id = match.group(1)

        # Get MCP server URL from environment
        mcp_url = os.environ.get('GOOGLE_CHAT_MCP_URL')
        if not mcp_url:
            return cors_response(500, {'error': 'Chat MCP server not configured'})

        # For now, return a placeholder that shows the structure
        # The actual MCP integration would require SSE client handling
        # which is complex in Lambda. We'll use a simplified approach.

        summary = {
            'spaceId': space_id,
            'lastUpdated': datetime.utcnow().isoformat() + 'Z',
            'messageCount': 0,
            'participants': [],
            'recentActivity': [],
            'sentiment': 'neutral',
            'status': 'pending_integration',
            'message': 'Chat integration pending - MCP SSE connection required'
        }

        return cors_response(200, summary)

    except Exception as e:
        print(f"Error: {str(e)}")
        return cors_response(500, {'error': str(e)})
