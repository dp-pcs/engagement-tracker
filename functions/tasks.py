import json
import os
import uuid
from datetime import datetime
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
tasks_table = dynamodb.Table(os.environ['TASKS_TABLE'])
engagements_table = dynamodb.Table(os.environ['ENGAGEMENTS_TABLE'])

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
    path = event.get('path', '')

    if http_method == 'OPTIONS':
        return cors_response(200, {})

    try:
        # Handle /tasks/engagement/{engagementId} route
        if '/engagement/' in path:
            engagement_id = path.split('/engagement/')[-1]
            return get_tasks_by_engagement(engagement_id)

        if http_method == 'GET':
            if 'id' in path_params:
                return get_task(path_params['id'])
            else:
                return list_tasks(event)
        elif http_method == 'POST':
            return create_task(json.loads(event['body']))
        elif http_method == 'PUT':
            return update_task(path_params['id'], json.loads(event['body']))
        elif http_method == 'DELETE':
            return delete_task(path_params['id'])
        else:
            return cors_response(405, {'error': 'Method not allowed'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def list_tasks(event):
    query_params = event.get('queryStringParameters') or {}

    if 'engagementId' in query_params:
        response = tasks_table.query(
            IndexName='engagement-index',
            KeyConditionExpression=Key('engagementId').eq(query_params['engagementId'])
        )
    else:
        response = tasks_table.scan()

    items = response.get('Items', [])

    # Sort by priority then createdAt
    priority_order = {'high': 0, 'medium': 1, 'low': 2}
    items.sort(key=lambda x: (priority_order.get(x.get('priority', 'medium'), 1), x.get('createdAt', '')))

    # Calculate summary stats
    total = len(items)
    completed = len([t for t in items if t.get('status') == 'completed'])
    in_progress = len([t for t in items if t.get('status') == 'in-progress'])

    return cors_response(200, {
        'tasks': items,
        'summary': {
            'total': total,
            'completed': completed,
            'inProgress': in_progress,
            'pending': total - completed - in_progress,
            'percentComplete': round((completed / total * 100) if total > 0 else 0)
        }
    })

def get_tasks_by_engagement(engagement_id):
    response = tasks_table.query(
        IndexName='engagement-index',
        KeyConditionExpression=Key('engagementId').eq(engagement_id)
    )

    items = response.get('Items', [])

    # Sort by priority then createdAt
    priority_order = {'high': 0, 'medium': 1, 'low': 2}
    items.sort(key=lambda x: (priority_order.get(x.get('priority', 'medium'), 1), x.get('createdAt', '')))

    total = len(items)
    completed = len([t for t in items if t.get('status') == 'completed'])
    in_progress = len([t for t in items if t.get('status') == 'in-progress'])

    return cors_response(200, {
        'tasks': items,
        'summary': {
            'total': total,
            'completed': completed,
            'inProgress': in_progress,
            'pending': total - completed - in_progress,
            'percentComplete': round((completed / total * 100) if total > 0 else 0)
        }
    })

def get_task(task_id):
    response = tasks_table.get_item(Key={'id': task_id})

    if 'Item' not in response:
        return cors_response(404, {'error': 'Task not found'})

    return cors_response(200, response['Item'])

def create_task(data):
    task_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + 'Z'

    # Verify engagement exists
    eng_response = engagements_table.get_item(Key={'id': data['engagementId']})
    if 'Item' not in eng_response:
        return cors_response(404, {'error': 'Engagement not found'})

    engagement = eng_response['Item']

    item = {
        'id': task_id,
        'engagementId': data['engagementId'],
        'engagementName': engagement.get('name', ''),
        'title': data['title'],
        'description': data.get('description', ''),
        'status': data.get('status', 'pending'),  # pending, in-progress, completed, blocked
        'priority': data.get('priority', 'medium'),  # high, medium, low
        'assignee': data.get('assignee', ''),
        'dueDate': data.get('dueDate', ''),
        'completedAt': '',
        'createdAt': now,
        'updatedAt': now
    }

    tasks_table.put_item(Item=item)

    return cors_response(201, item)

def update_task(task_id, data):
    response = tasks_table.get_item(Key={'id': task_id})
    if 'Item' not in response:
        return cors_response(404, {'error': 'Task not found'})

    existing = response['Item']
    now = datetime.utcnow().isoformat() + 'Z'

    # If marking as completed, set completedAt
    if data.get('status') == 'completed' and existing.get('status') != 'completed':
        data['completedAt'] = now
    elif data.get('status') != 'completed':
        data['completedAt'] = ''

    update_parts = []
    expression_values = {}
    expression_names = {}

    allowed_fields = ['title', 'description', 'status', 'priority', 'assignee', 'dueDate', 'completedAt']

    for field in allowed_fields:
        if field in data:
            update_parts.append(f'#{field} = :{field}')
            expression_values[f':{field}'] = data[field]
            expression_names[f'#{field}'] = field

    update_parts.append('#updatedAt = :updatedAt')
    expression_values[':updatedAt'] = now
    expression_names['#updatedAt'] = 'updatedAt'

    tasks_table.update_item(
        Key={'id': task_id},
        UpdateExpression='SET ' + ', '.join(update_parts),
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames=expression_names
    )

    response = tasks_table.get_item(Key={'id': task_id})
    return cors_response(200, response['Item'])

def delete_task(task_id):
    tasks_table.delete_item(Key={'id': task_id})
    return cors_response(200, {'message': 'Task deleted'})
