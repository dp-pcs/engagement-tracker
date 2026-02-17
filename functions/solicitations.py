import json
import os
import uuid
import secrets
from datetime import datetime, timedelta
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
solicitations_table = dynamodb.Table(os.environ['SOLICITATIONS_TABLE'])
engagements_table = dynamodb.Table(os.environ['ENGAGEMENTS_TABLE'])

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:8080')

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
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps(body, default=decimal_default)
    }

def handler(event, context):
    http_method = event['httpMethod']
    path_params = event.get('pathParameters') or {}

    if http_method == 'OPTIONS':
        return cors_response(200, {})

    try:
        if http_method == 'GET':
            if 'token' in path_params:
                return get_solicitation(path_params['token'])
            else:
                return list_solicitations(event)
        elif http_method == 'POST':
            return create_solicitation(json.loads(event['body']))
        else:
            return cors_response(405, {'error': 'Method not allowed'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def list_solicitations(event):
    query_params = event.get('queryStringParameters') or {}

    if 'engagementId' in query_params:
        response = solicitations_table.query(
            IndexName='engagement-index',
            KeyConditionExpression=Key('engagementId').eq(query_params['engagementId'])
        )
    else:
        response = solicitations_table.scan()

    items = response.get('Items', [])
    # Sort by createdAt descending
    items.sort(key=lambda x: x.get('createdAt', ''), reverse=True)

    return cors_response(200, {'solicitations': items})

def get_solicitation(token):
    """Get solicitation by token - used by frontend to load the feedback form"""
    response = solicitations_table.get_item(Key={'token': token})

    if 'Item' not in response:
        return cors_response(404, {'error': 'Solicitation not found or expired'})

    solicitation = response['Item']

    # Check if expired
    if solicitation.get('expiresAt'):
        expires_at = datetime.fromisoformat(solicitation['expiresAt'].replace('Z', '+00:00'))
        if datetime.now(expires_at.tzinfo) > expires_at:
            return cors_response(410, {'error': 'This feedback request has expired'})

    # Check if already completed
    if solicitation.get('status') == 'completed':
        return cors_response(410, {'error': 'This feedback request has already been completed'})

    # Get engagement details
    if solicitation.get('engagementId'):
        eng_response = engagements_table.get_item(Key={'id': solicitation['engagementId']})
        if 'Item' in eng_response:
            solicitation['engagement'] = eng_response['Item']

    return cors_response(200, solicitation)

def create_solicitation(data):
    """Create a new solicitation request"""

    # Validate engagement exists
    engagement_id = data.get('engagementId')
    if not engagement_id:
        return cors_response(400, {'error': 'engagementId is required'})

    eng_response = engagements_table.get_item(Key={'id': engagement_id})
    if 'Item' not in eng_response:
        return cors_response(404, {'error': 'Engagement not found'})

    engagement = eng_response['Item']

    # Generate secure token
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()

    # Default expiry is 14 days
    expiry_days = data.get('expiryDays', 14)
    expires_at = now + timedelta(days=expiry_days)

    item = {
        'token': token,
        'engagementId': engagement_id,
        'engagementName': engagement.get('name', ''),
        'recipientName': data.get('recipientName', ''),
        'recipientEmail': data.get('recipientEmail', ''),
        'recipientRole': data.get('recipientRole', ''),
        'message': data.get('message', ''),  # Personal message to include
        'requestedBy': data.get('requestedBy', ''),
        'status': 'pending',  # pending, completed, expired
        'createdAt': now.isoformat() + 'Z',
        'expiresAt': expires_at.isoformat() + 'Z',
        'expiresAtTTL': int(expires_at.timestamp()),  # For DynamoDB TTL
    }

    solicitations_table.put_item(Item=item)

    # Generate the feedback URL
    feedback_url = f"{FRONTEND_URL}/feedback.html?token={token}"

    return cors_response(201, {
        **item,
        'feedbackUrl': feedback_url
    })
