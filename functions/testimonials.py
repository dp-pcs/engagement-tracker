import json
import os
import uuid
from datetime import datetime
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
testimonials_table = dynamodb.Table(os.environ['TESTIMONIALS_TABLE'])
engagements_table = dynamodb.Table(os.environ['ENGAGEMENTS_TABLE'])
solicitations_table = dynamodb.Table(os.environ['SOLICITATIONS_TABLE'])

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
    path = event.get('path', '')
    path_params = event.get('pathParameters') or {}

    if http_method == 'OPTIONS':
        return cors_response(200, {})

    try:
        # Public endpoint for ad-hoc and solicited submissions
        if '/public/testimonials' in path and http_method == 'POST':
            return create_public_testimonial(json.loads(event['body']))

        if http_method == 'GET':
            if 'id' in path_params:
                return get_testimonial(path_params['id'])
            else:
                return list_testimonials(event)
        elif http_method == 'POST':
            return create_testimonial(json.loads(event['body']))
        elif http_method == 'PUT':
            return update_testimonial(path_params['id'], json.loads(event['body']))
        else:
            return cors_response(405, {'error': 'Method not allowed'})
    except Exception as e:
        print(f"Error: {str(e)}")
        return cors_response(500, {'error': str(e)})

def list_testimonials(event):
    query_params = event.get('queryStringParameters') or {}

    if 'engagementId' in query_params:
        response = testimonials_table.query(
            IndexName='engagement-index',
            KeyConditionExpression=Key('engagementId').eq(query_params['engagementId'])
        )
    else:
        response = testimonials_table.scan()

    items = response.get('Items', [])
    # Sort by submittedAt descending
    items.sort(key=lambda x: x.get('submittedAt', ''), reverse=True)

    return cors_response(200, {'testimonials': items})

def get_testimonial(testimonial_id):
    response = testimonials_table.get_item(Key={'id': testimonial_id})

    if 'Item' not in response:
        return cors_response(404, {'error': 'Testimonial not found'})

    return cors_response(200, response['Item'])

def create_testimonial(data):
    """Internal creation (from admin UI)"""
    return _create_testimonial(data, source='internal')

def create_public_testimonial(data):
    """Public creation (ad-hoc or via solicitation link)"""
    solicitation_token = data.get('solicitationToken')

    if solicitation_token:
        # Validate solicitation token
        response = solicitations_table.get_item(Key={'token': solicitation_token})
        if 'Item' not in response:
            return cors_response(400, {'error': 'Invalid or expired solicitation token'})

        solicitation = response['Item']

        # Check if already completed
        if solicitation.get('status') == 'completed':
            return cors_response(400, {'error': 'This feedback request has already been completed'})

        # Use engagement from solicitation
        data['engagementId'] = solicitation['engagementId']
        data['engagementName'] = solicitation.get('engagementName', '')

        # Mark solicitation as completed
        solicitations_table.update_item(
            Key={'token': solicitation_token},
            UpdateExpression='SET #status = :status, completedAt = :completedAt',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'completed',
                ':completedAt': datetime.utcnow().isoformat() + 'Z'
            }
        )

        return _create_testimonial(data, source='solicited')
    else:
        # Ad-hoc submission
        return _create_testimonial(data, source='ad-hoc')

def _create_testimonial(data, source='internal'):
    testimonial_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + 'Z'

    # Get engagement name if we have an ID
    engagement_name = data.get('engagementName', '')
    if data.get('engagementId') and not engagement_name:
        eng_response = engagements_table.get_item(Key={'id': data['engagementId']})
        if 'Item' in eng_response:
            engagement_name = eng_response['Item'].get('name', '')

    item = {
        'id': testimonial_id,
        'engagementId': data.get('engagementId', ''),
        'engagementName': engagement_name,
        'submitterName': data.get('submitterName', ''),
        'submitterEmail': data.get('submitterEmail', ''),
        'submitterRole': data.get('submitterRole', ''),
        'submitterTeam': data.get('submitterTeam', ''),
        'rating': data.get('rating', 0),  # 1-5 scale
        'testimonialText': data.get('testimonialText', ''),
        'whatWorkedWell': data.get('whatWorkedWell', ''),
        'whatCouldImprove': data.get('whatCouldImprove', ''),
        'wouldRecommend': data.get('wouldRecommend', True),
        'source': source,  # 'ad-hoc', 'solicited', 'internal'
        'solicitationToken': data.get('solicitationToken', ''),
        'approved': data.get('approved', False),  # For public display
        'featured': data.get('featured', False),
        'submittedAt': now,
        'updatedAt': now
    }

    testimonials_table.put_item(Item=item)

    return cors_response(201, item)

def update_testimonial(testimonial_id, data):
    response = testimonials_table.get_item(Key={'id': testimonial_id})
    if 'Item' not in response:
        return cors_response(404, {'error': 'Testimonial not found'})

    now = datetime.utcnow().isoformat() + 'Z'

    update_parts = []
    expression_values = {}
    expression_names = {}

    allowed_fields = ['approved', 'featured', 'testimonialText', 'rating',
                      'whatWorkedWell', 'whatCouldImprove', 'wouldRecommend']

    for field in allowed_fields:
        if field in data:
            update_parts.append(f'#{field} = :{field}')
            expression_values[f':{field}'] = data[field]
            expression_names[f'#{field}'] = field

    update_parts.append('#updatedAt = :updatedAt')
    expression_values[':updatedAt'] = now
    expression_names['#updatedAt'] = 'updatedAt'

    testimonials_table.update_item(
        Key={'id': testimonial_id},
        UpdateExpression='SET ' + ', '.join(update_parts),
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames=expression_names
    )

    response = testimonials_table.get_item(Key={'id': testimonial_id})
    return cors_response(200, response['Item'])
