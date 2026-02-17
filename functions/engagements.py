import json
import os
import uuid
from datetime import datetime
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['ENGAGEMENTS_TABLE'])

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
            if 'id' in path_params:
                return get_engagement(path_params['id'])
            else:
                return list_engagements(event)
        elif http_method == 'POST':
            return create_engagement(json.loads(event['body']))
        elif http_method == 'PUT':
            return update_engagement(path_params['id'], json.loads(event['body']))
        elif http_method == 'DELETE':
            return delete_engagement(path_params['id'])
        else:
            return cors_response(405, {'error': 'Method not allowed'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def list_engagements(event):
    query_params = event.get('queryStringParameters') or {}

    if 'status' in query_params:
        response = table.query(
            IndexName='status-index',
            KeyConditionExpression=Key('status').eq(query_params['status'])
        )
    else:
        response = table.scan()

    items = response.get('Items', [])
    # Sort by updatedAt descending
    items.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)

    return cors_response(200, {'engagements': items})

def get_engagement(engagement_id):
    response = table.get_item(Key={'id': engagement_id})

    if 'Item' not in response:
        return cors_response(404, {'error': 'Engagement not found'})

    return cors_response(200, response['Item'])

def create_engagement(data):
    engagement_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + 'Z'

    item = {
        'id': engagement_id,
        'name': data['name'],
        'team': data.get('team', ''),
        'description': data.get('description', ''),
        'status': data.get('status', 'discovery'),  # discovery, active, paused, closed-complete, closed-failed
        'owner': data.get('owner', ''),
        'stakeholders': data.get('stakeholders', []),
        'tools': data.get('tools', []),  # MCP servers involved
        'agents': data.get('agents', []),  # Braintrust agents deployed
        'objectives': data.get('objectives', ''),
        'chatSpace': data.get('chatSpace', ''),
        'successMetrics': data.get('successMetrics', ''),
        'blockers': data.get('blockers', ''),
        'nextSteps': data.get('nextSteps', ''),
        'notes': data.get('notes', ''),
        'startDate': data.get('startDate', now[:10]),
        'targetDate': data.get('targetDate', ''),
        'completedDate': data.get('completedDate', ''),
        'createdAt': now,
        'updatedAt': now
    }

    table.put_item(Item=item)

    return cors_response(201, item)

def update_engagement(engagement_id, data):
    # First check if exists
    response = table.get_item(Key={'id': engagement_id})
    if 'Item' not in response:
        return cors_response(404, {'error': 'Engagement not found'})

    existing = response['Item']
    now = datetime.utcnow().isoformat() + 'Z'

    # Handle status change to closed - set completedDate
    if data.get('status') in ['closed-complete', 'closed-failed'] and existing.get('status') not in ['closed-complete', 'closed-failed']:
        data['completedDate'] = now[:10]

    # Build update expression
    update_parts = []
    expression_values = {}
    expression_names = {}

    allowed_fields = ['name', 'team', 'description', 'status', 'owner', 'stakeholders',
                      'tools', 'agents', 'objectives', 'chatSpace', 'successMetrics', 'blockers',
                      'nextSteps', 'notes', 'startDate', 'targetDate', 'completedDate']

    for field in allowed_fields:
        if field in data:
            update_parts.append(f'#{field} = :{field}')
            expression_values[f':{field}'] = data[field]
            expression_names[f'#{field}'] = field

    update_parts.append('#updatedAt = :updatedAt')
    expression_values[':updatedAt'] = now
    expression_names['#updatedAt'] = 'updatedAt'

    table.update_item(
        Key={'id': engagement_id},
        UpdateExpression='SET ' + ', '.join(update_parts),
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames=expression_names
    )

    # Return updated item
    response = table.get_item(Key={'id': engagement_id})
    return cors_response(200, response['Item'])

def delete_engagement(engagement_id):
    table.delete_item(Key={'id': engagement_id})
    return cors_response(200, {'message': 'Engagement deleted'})
