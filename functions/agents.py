import json
import os
import uuid
from datetime import datetime
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
agents_table = dynamodb.Table(os.environ['AGENTS_TABLE'])
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

    if http_method == 'OPTIONS':
        return cors_response(200, {})

    try:
        if http_method == 'GET':
            if 'id' in path_params:
                return get_agent(path_params['id'])
            else:
                return list_agents(event)
        elif http_method == 'POST':
            return create_agent(json.loads(event['body']))
        elif http_method == 'PUT':
            return update_agent(path_params['id'], json.loads(event['body']))
        elif http_method == 'DELETE':
            return delete_agent(path_params['id'])
        else:
            return cors_response(405, {'error': 'Method not allowed'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def list_agents(event):
    response = agents_table.scan()
    items = response.get('Items', [])

    # Sort by name
    items.sort(key=lambda x: x.get('name', '').lower())

    # Optionally include engagement mappings
    query_params = event.get('queryStringParameters') or {}
    if query_params.get('includeEngagements') == 'true':
        # Get all engagements
        eng_response = engagements_table.scan()
        engagements = eng_response.get('Items', [])

        # Build agent -> engagements mapping
        for agent in items:
            agent['engagements'] = []
            for eng in engagements:
                eng_agents = eng.get('agents', [])
                if agent['name'] in eng_agents:
                    agent['engagements'].append({
                        'id': eng['id'],
                        'name': eng['name'],
                        'status': eng['status'],
                        'team': eng.get('team', '')
                    })

    return cors_response(200, {'agents': items})

def get_agent(agent_id):
    response = agents_table.get_item(Key={'id': agent_id})

    if 'Item' not in response:
        return cors_response(404, {'error': 'Agent not found'})

    agent = response['Item']

    # Get all engagements using this agent
    eng_response = engagements_table.scan()
    engagements = eng_response.get('Items', [])

    agent['engagements'] = []
    for eng in engagements:
        eng_agents = eng.get('agents', [])
        if agent['name'] in eng_agents:
            agent['engagements'].append({
                'id': eng['id'],
                'name': eng['name'],
                'status': eng['status'],
                'team': eng.get('team', ''),
                'description': eng.get('description', '')
            })

    return cors_response(200, agent)

def create_agent(data):
    agent_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + 'Z'

    # Check if agent with same name already exists
    existing = agents_table.scan(
        FilterExpression='#n = :name',
        ExpressionAttributeNames={'#n': 'name'},
        ExpressionAttributeValues={':name': data['name']}
    )
    if existing.get('Items'):
        return cors_response(409, {'error': 'Agent with this name already exists'})

    item = {
        'id': agent_id,
        'name': data['name'],
        'description': data.get('description', ''),
        'type': data.get('type', 'assistant'),  # assistant, workflow, tool
        'platform': data.get('platform', 'braintrust'),  # braintrust, custom, etc.
        'capabilities': data.get('capabilities', []),
        'status': data.get('status', 'active'),  # active, inactive, deprecated
        'createdAt': now,
        'updatedAt': now
    }

    agents_table.put_item(Item=item)

    return cors_response(201, item)

def update_agent(agent_id, data):
    response = agents_table.get_item(Key={'id': agent_id})
    if 'Item' not in response:
        return cors_response(404, {'error': 'Agent not found'})

    now = datetime.utcnow().isoformat() + 'Z'

    update_parts = []
    expression_values = {}
    expression_names = {}

    allowed_fields = ['name', 'description', 'type', 'platform', 'capabilities', 'status']

    for field in allowed_fields:
        if field in data:
            update_parts.append(f'#{field} = :{field}')
            expression_values[f':{field}'] = data[field]
            expression_names[f'#{field}'] = field

    update_parts.append('#updatedAt = :updatedAt')
    expression_values[':updatedAt'] = now
    expression_names['#updatedAt'] = 'updatedAt'

    agents_table.update_item(
        Key={'id': agent_id},
        UpdateExpression='SET ' + ', '.join(update_parts),
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames=expression_names
    )

    response = agents_table.get_item(Key={'id': agent_id})
    return cors_response(200, response['Item'])

def delete_agent(agent_id):
    agents_table.delete_item(Key={'id': agent_id})
    return cors_response(200, {'message': 'Agent deleted'})
