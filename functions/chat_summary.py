import json
import os
import boto3
import urllib.request
import urllib.error
import time
import re
from datetime import datetime
from decimal import Decimal

# Initialize clients
dynamodb = boto3.resource('dynamodb')
secrets_client = boto3.client('secretsmanager')

# Tables
summaries_table_name = os.environ.get('CHAT_SUMMARIES_TABLE', 'engagement-tracker-chat-summaries-dev')
engagements_table_name = os.environ.get('ENGAGEMENTS_TABLE', 'engagement-tracker-engagements-dev')

# Cache for secrets
_secrets_cache = {}

def get_secret(secret_name):
    """Get secret from Secrets Manager with caching"""
    if secret_name in _secrets_cache:
        return _secrets_cache[secret_name]

    response = secrets_client.get_secret_value(SecretId=secret_name)
    secret = response['SecretString']
    _secrets_cache[secret_name] = secret
    return secret

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def cors_response(status_code, body):
    """Return response with CORS headers"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps(body, default=decimal_default)
    }

def fetch_chat_messages(mcp_url, space_id, limit=50):
    """Fetch chat messages from MCP server"""
    try:
        # Parse the MCP URL to get the API endpoint
        # URL format: https://mcp-server.ti.trilogy.com/5b4a6a39/sse?x-api-key=...
        base_parts = mcp_url.split('?')
        base_url = base_parts[0].replace('/sse', '')
        api_key = None
        if len(base_parts) > 1:
            params = dict(p.split('=') for p in base_parts[1].split('&'))
            api_key = params.get('x-api-key')

        # Try MCP tools/call endpoint
        tools_url = f"{base_url}/tools/call"

        payload = json.dumps({
            "name": "list_messages",
            "arguments": {
                "space_id": space_id,
                "limit": limit
            }
        }).encode()

        req = urllib.request.Request(tools_url, data=payload, method='POST')
        if api_key:
            req.add_header('x-api-key', api_key)
        req.add_header('Content-Type', 'application/json')
        req.add_header('Accept', 'application/json')

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode())
            # MCP response format typically has content array
            content = data.get('content', [])
            if isinstance(content, list) and len(content) > 0:
                # Text content from MCP
                if isinstance(content[0], dict) and 'text' in content[0]:
                    try:
                        return json.loads(content[0]['text'])
                    except:
                        return content
            return data.get('messages', content)
    except urllib.error.HTTPError as e:
        print(f"HTTP Error fetching messages: {e.code} - {e.reason}")
        return []
    except Exception as e:
        print(f"Error fetching messages: {e}")
        return []

def summarize_with_claude(messages, anthropic_api_key, chat_space_url):
    """Use Claude to summarize chat messages"""
    if not messages:
        return {
            'summary': 'No recent chat activity found in this space.',
            'topics': [],
            'participants': [],
            'sentiment': 'neutral',
            'keyHighlights': [],
            'actionItems': []
        }

    # Handle different message formats
    messages_text = ""
    participants = set()

    for msg in messages:
        if isinstance(msg, dict):
            sender = msg.get('sender', {})
            if isinstance(sender, dict):
                name = sender.get('displayName') or sender.get('name', 'Unknown')
            else:
                name = str(sender) if sender else 'Unknown'

            text = msg.get('text') or msg.get('message', '')
            if text:
                messages_text += f"[{name}]: {text}\n"
                if name and name != 'Unknown':
                    participants.add(name)
        elif isinstance(msg, str):
            messages_text += f"{msg}\n"

    participants = list(participants)

    if not messages_text.strip():
        return {
            'summary': 'Chat space exists but no readable messages found.',
            'topics': [],
            'participants': participants,
            'sentiment': 'neutral',
            'keyHighlights': [],
            'actionItems': []
        }

    prompt = f"""Analyze this Google Chat conversation and provide a structured summary.

CHAT MESSAGES:
{messages_text[:8000]}

Please provide your analysis in the following JSON format:
{{
    "summary": "A 2-3 sentence overview of what was discussed",
    "topics": ["topic1", "topic2", "topic3"],
    "sentiment": "positive" or "neutral" or "negative" or "mixed",
    "keyHighlights": ["highlight1", "highlight2", "highlight3"],
    "actionItems": ["action1", "action2"]
}}

Focus on:
- Key discussion points and decisions
- Any blockers or issues raised
- Progress updates
- Action items or next steps

Return ONLY the JSON, no other text."""

    try:
        url = "https://api.anthropic.com/v1/messages"

        payload = json.dumps({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        }).encode()

        req = urllib.request.Request(url, data=payload, method='POST')
        req.add_header('x-api-key', anthropic_api_key)
        req.add_header('anthropic-version', '2023-06-01')
        req.add_header('Content-Type', 'application/json')

        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode())
            content = data.get('content', [{}])[0].get('text', '{}')

            # Parse the JSON response - handle markdown code blocks
            content = content.strip()
            if content.startswith('```'):
                content = re.sub(r'^```(?:json)?\n?', '', content)
                content = re.sub(r'\n?```$', '', content)

            try:
                result = json.loads(content)
                result['participants'] = participants
                return result
            except json.JSONDecodeError:
                return {
                    'summary': content[:500] if content else 'Unable to generate summary',
                    'topics': [],
                    'participants': participants,
                    'sentiment': 'neutral',
                    'keyHighlights': [],
                    'actionItems': []
                }
    except Exception as e:
        print(f"Error calling Claude API: {e}")
        return {
            'summary': f'Error generating summary: {str(e)}',
            'topics': [],
            'participants': participants,
            'sentiment': 'neutral',
            'keyHighlights': [],
            'actionItems': []
        }

def extract_space_id(chat_space_url):
    """Extract space ID from Google Chat URL"""
    # URL format: https://chat.google.com/room/AAQA5Go_5yw?cls=7
    if '/room/' in chat_space_url:
        space_id = chat_space_url.split('/room/')[1].split('?')[0]
        return space_id
    return None

def handler(event, context):
    """Lambda handler for chat summary"""
    http_method = event.get('httpMethod', '')

    # Handle CORS preflight
    if http_method == 'OPTIONS':
        return cors_response(200, {})

    # GET /chat-summary/{engagementId}
    if http_method == 'GET':
        path_params = event.get('pathParameters', {}) or {}
        query_params = event.get('queryStringParameters', {}) or {}
        engagement_id = path_params.get('engagementId')
        refresh = query_params.get('refresh', 'false').lower() == 'true'

        if not engagement_id:
            return cors_response(400, {'error': 'engagementId is required'})

        # Get tables
        summaries_table = dynamodb.Table(summaries_table_name)
        engagements_table = dynamodb.Table(engagements_table_name)

        try:
            # Get engagement to find chat space URL
            engagement_response = engagements_table.get_item(Key={'id': engagement_id})
            engagement = engagement_response.get('Item')

            if not engagement:
                return cors_response(404, {'error': 'Engagement not found'})

            chat_space_url = engagement.get('chatSpace')
            if not chat_space_url:
                return cors_response(200, {
                    'engagementId': engagement_id,
                    'hasChatSpace': False,
                    'summary': None,
                    'message': 'No chat space configured for this engagement'
                })

            space_id = extract_space_id(chat_space_url)
            if not space_id:
                return cors_response(400, {'error': 'Invalid chat space URL format'})

            # Check cache first (unless refresh requested)
            if not refresh:
                try:
                    cache_response = summaries_table.get_item(Key={'engagementId': engagement_id})
                    cached = cache_response.get('Item')

                    if cached:
                        # Check if cache is still valid (24 hours)
                        cached_at = cached.get('cachedAt', 0)
                        if isinstance(cached_at, Decimal):
                            cached_at = int(cached_at)

                        cache_age_hours = (time.time() - cached_at) / 3600
                        if cache_age_hours < 24:
                            return cors_response(200, {
                                'engagementId': engagement_id,
                                'hasChatSpace': True,
                                'chatSpaceUrl': chat_space_url,
                                'summary': cached.get('summary'),
                                'cachedAt': datetime.fromtimestamp(cached_at).isoformat(),
                                'fromCache': True
                            })
                except Exception as e:
                    print(f"Cache lookup error: {e}")

            # Fetch fresh data
            mcp_url = get_secret('pulse-engagement-tracker/google-chat-mcp')
            anthropic_key = get_secret('pulse-engagement-tracker/anthropic-api-key')

            # Fetch messages from chat
            messages = fetch_chat_messages(mcp_url, space_id, limit=100)

            # Generate summary with Claude
            summary = summarize_with_claude(messages, anthropic_key, chat_space_url)

            # Cache the result
            cache_time = int(time.time())
            try:
                summaries_table.put_item(Item={
                    'engagementId': engagement_id,
                    'summary': summary,
                    'cachedAt': cache_time,
                    'messageCount': len(messages) if isinstance(messages, list) else 0
                })
            except Exception as e:
                print(f"Cache write error: {e}")

            return cors_response(200, {
                'engagementId': engagement_id,
                'hasChatSpace': True,
                'chatSpaceUrl': chat_space_url,
                'summary': summary,
                'cachedAt': datetime.fromtimestamp(cache_time).isoformat(),
                'fromCache': False,
                'messageCount': len(messages) if isinstance(messages, list) else 0
            })

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            return cors_response(500, {'error': str(e)})

    return cors_response(405, {'error': 'Method not allowed'})
