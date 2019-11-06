var g_socket;

var g_current;
var g_last_received = -1;
var g_last_confirmed = -1;
var g_connected = false;
var g_next_client_message_id = 0;

var g_objects = {};

function enable(name, callback)
{
	var element = document.getElementById(name);
	element.className = name + '_enabled';
	element.onclick = callback;
}

function disable(name)
{
	var element = document.getElementById(name);
	element.className = name + '_disabled';
	element.onclick = '';
}

function onSocketClosed()
{
	g_connected = false;
	g_socket = null;

	disable('function_call');
	disable('disconnect');
}

function destroySocket()
{
	if (g_socket)
	{
		g_socket.onopen = null;
		g_socket.onclose = null;
		g_socket.onmessage = null;

		g_socket.close();
		onSocketClosed();
	}
}

function getClientInfo()
{
	var info = {};
	info.client = 'test js client';
	info.version = '0.1';
	info.platform = navigator.userAgent;
	return info;
}

function clearMessages()
{
	var message_list = document.getElementById('message_list');
	message_list.innerHTML = '';

	disable('clear');
}

function addMessage(message_number, type, name, message_text, on_click_function)
{
	if (type == 'change')
	{
		var change_checkbox = document.getElementById('change_checkbox');
		if (!change_checkbox.checked)
		{
			return;
		}
	}

	var message = document.createElement('div');
	if (message_number != null)
	{
		message.id = 'message_' + message_number;
	}
	message.className = 'message_' + type;
	message.innerHTML = name;
	message.title = message_text;

	if (on_click_function)
	{
		message.onclick = on_click_function;
	}

	var message_list = document.getElementById('message_list');
	message_list.insertBefore(message, message_list.firstChild);

	enable('clear', clearMessages);
}

function getMessageNumber()
{
	return g_next_client_message_id++;
}

function sendConnectMessage(client_id)
{
	var message_number = getMessageNumber();

	var message = {};
	message.type = 'connect';
	message.num = message_number;
	message.client_id = client_id;
	if (g_last_received != -1)
	{
		message.last_received = g_last_received;
	}
	message.info = getClientInfo();

	var message_text = JSON.stringify(message);
	var formatted_message_text = JSON.stringify(message, null, '\t');

	addMessage(message_number, 'connect', '>> connect', formatted_message_text, null);

	g_socket.send(message_text);
}

function callFunction()
{
	var function_name = document.getElementById('function_name');
	var function_params = document.getElementById('function_params');

	var function_name_value = function_name.value;
	var function_params_value = function_params.value;

	var message_number = getMessageNumber();

	var message = {};
	message.type = 'call';
	message.num = message_number;
	message.name = function_name_value;
	message.params = JSON.parse(function_params_value);

	var message_text = JSON.stringify(message);
	var formatted_message_text = JSON.stringify(message, null, '\t');

	addMessage(
		message_number,
		'function_call',
		'>> ' + function_name.value + '(...)',
		formatted_message_text,
		function()
		{
			function_name.value = function_name_value;
			function_params.value = function_params_value;
		});

	g_socket.send(message_text);
}

function updateStyle(name)
{
	var element = document.getElementById(name);
	if (element.value && g_current && element.value == g_current[name])
	{
		element.className = name + '_current';
	}
	else
	{
		element.className = name;
	}
}

function updateServerParamsStyle()
{
	updateStyle('url');
	updateStyle('client_id');
}

function updateFunctionCallStyle()
{
	var function_name = document.getElementById('function_name');
	var function_params = document.getElementById('function_params');

	var function_params_parsed;

	try
	{
		function_params_parsed = JSON.parse(function_params.value);
	}
	catch (error)
	{
	}

	if (
		!g_connected ||
		!function_name.value ||
		!function_params_parsed ||
		typeof function_params_parsed != 'object' ||
		Array.isArray(function_params_parsed))
	{
		disable('function_call');
	}
	else
	{
		enable('function_call', callFunction);
	}
}

function processReceivedMessage(message)
{
	var value = message.value;
	if (!Number.isInteger(value) || value < 0)
	{
		console.error('Invalid received-message value');
		return;
	}

	if (g_last_confirmed >= value)
	{
		console.error('Confirm for already confirmed message received');
		return;
	}

	for (var message_number = g_last_confirmed + 1; message_number <= value; ++message_number)
	{
		var message = document.getElementById('message_' + message_number);
		if (message)
		{
			message.className = message.className + '_confirmed';
		}
	}

	g_last_confirmed = value;
}

function resetMessagesIds()
{
	var message_list = document.getElementById('message_list');
	for (var idx = 0; idx < message_list.children.length; ++idx)
	{
		message_list.children[idx].id = '';
	}
}

function sendReceived()
{
	var message = {};
	message.type = 'received';
	message.value = g_last_received;

	g_socket.send(JSON.stringify(message));
}

function parseObjectChange(object_change)
{
	if (!object_change || typeof object_change != 'object' || Array.isArray(object_change))
	{
		console.error('Invalid object change');
		return null;
	}

	return object_change;
}

function parseChange(change_to_parse)
{
	if (!change_to_parse || typeof change_to_parse != 'object' || Array.isArray(change_to_parse))
	{
		console.error('Invalid change');
		return null;
	}

	var remove = change_to_parse.remove;
	var change = change_to_parse.change;
	if (!remove && !change)
	{
		console.error('Change should contain remove or change');
		return null;
	}

	var parsed_change = {"remove": [], "change": {}};

	if (remove)
	{
		if (!Array.isArray(remove))
		{
			console.error("Invalid change's remove");
			return null;
		}

		for (var removed_id of remove)
		{
			if (typeof removed_id != 'string')
			{
				console.error('Invalid removed id, should be string');
				return null;
			}

			parsed_change.remove.push(removed_id);
		}
	}

	if (change)
	{
		if (typeof change != 'object' || Array.isArray(change))
		{
			console.error("Invalid change's change");
			return null;
		}

		for (var [key, value] of Object.entries(change))
		{
			var object_change = parseObjectChange(value);
			if (!object_change)
			{
				return null;
			}

			parsed_change.change[key] = object_change;
		}
	}

	return parsed_change;
}

function parseChanges(changes)
{
	if (!Array.isArray(changes))
	{
		console.error('Invalid changes format');
		return null;
	}

	var parsed_changes = [];
	for (var change of changes)
	{
		var parsed_change = parseChange(change);
		if (!parsed_change)
		{
			return null;
		}
		parsed_changes.push(parsed_change);
	}

	return parsed_changes;
}

function getObjectContent(object)
{
	var object_content = '';
	for (var [attribute, value] of Object.entries(object))
	{
		if (object_content)
		{
			object_content += '\n';
		}
		object_content += attribute;
		object_content += ': ';
		object_content += value;
	}
	return object_content;
}

function updateObjects(changed_object_ids)
{
	for (var changed_id of changed_object_ids)
	{
		var object_to_modify = document.getElementById('object_' + changed_id);

		if (!(changed_id in g_objects))
		{
			object_to_modify.parentNode.parentNode.removeChild(
				object_to_modify.parentNode);
		}
		else
		{
			if (!object_to_modify)
			{
				var object = document.createElement('div');
				object.className = 'object';

				var object_name = document.createElement('div');
				object_name.innerHTML = changed_id;
				object_name.className = 'object_name';
				object.appendChild(object_name);

				object_to_modify = document.createElement('div');
				object_to_modify.id = 'object_' + changed_id;
				object_to_modify.className = 'object_content';
				object.appendChild(object_to_modify);

				var objects = document.getElementById('objects');
				objects.appendChild(object);
			}
			object_to_modify.innerHTML = getObjectContent(g_objects[changed_id]);
		}
	}
}

function processChanges(changes)
{
	var changed_object_ids = new Set();

	for (var change of changes)
	{
		for (var object_id of change.remove)
		{
			if (!(object_id in g_objects))
			{
				console.warn('Received remove of non-existent object ' + object_id);
			}
			else
			{
				delete g_objects[object_id];
				changed_object_ids.add(object_id);
			}
		}
		for (var [object_id, object_change] of Object.entries(change.change))
		{
			if (!(object_id in g_objects))
			{
				g_objects[object_id] = {};
			}
			var object = g_objects[object_id];
			for (var [attr_name, value] of Object.entries(object_change))
			{
				if (value === null)
				{
					if (!(attr_name in object))
					{
						console.warn('Received remove of non-existent attribute');
					}
					delete object[attr_name];
				}
				else
				{
					if (attr_name in object && object[attr_name] === value)
					{
						console.warn('Received change with same attribute value');
					}
					object[attr_name] = value;
				}
			}
			changed_object_ids.add(object_id);
		}
	}

	updateObjects(changed_object_ids);
}

function clearObjects()
{
	g_objects = {};

	var objects = document.getElementById('objects');
	objects.innerHTML = '';
}

function createSocket()
{
	destroySocket();

	var storage = window.localStorage;

	var url = document.getElementById('url');
	var url_value = url.value.trim();
	var client_id = document.getElementById('client_id');
	var client_id_value = client_id.value;

	storage.setItem('url', url_value);
	storage.setItem('client_id', client_id_value);

	g_socket = new WebSocket(url_value);
	g_socket.onopen =
		function()
		{
			g_connected = true;

			if (
				!g_current ||
				g_current.url != url_value ||
				g_current.client_id != client_id_value)
			{
				g_last_received = -1;
				g_last_confirmed = -1;
				g_next_client_message_id = 0;
				g_current = {};
				g_current.url = url_value;
				g_current.client_id = client_id_value;
				updateServerParamsStyle();
				resetMessagesIds();
				clearObjects();
			}

			updateFunctionCallStyle();
			enable('disconnect', destroySocket);

			sendConnectMessage(client_id_value);
		};
	g_socket.onclose =
		function(event)
		{
			onSocketClosed();
		};
	g_socket.onmessage =
		function(event)
		{
			if (typeof event.data != 'string')
			{
				console.error('Binary message received');
				return;
			}

			var parsed_message;
			try
			{
				parsed_message = JSON.parse(event.data);
			}
			catch (error)
			{
				console.error('Message is not a valid JSON');
				return;
			}

			var message_type = parsed_message.type;
			if (message_type == 'received')
			{
				processReceivedMessage(parsed_message);
				return;
			}

			if (message_type != 'change' && message_type != 'clear')
			{
				console.error('Unsupported message type');
				return;
			}

			var message_number = parsed_message.num;
			if (!Number.isInteger(message_number) || message_number < 0)
			{
				console.error('Invalid "num" message field');
				return;
			}

			if (message_number != g_last_received + 1)
			{
				console.error('Expected continous message numbers');
				return;
			}

			if (message_type == 'change')
			{
				var parsed_changes = parseChanges(parsed_message.changes);
				if (!parsed_changes)
				{
					return;
				}

				processChanges(parsed_changes);
			}
			else
			{
				clearObjects();
			}

			++g_last_received;

			var formatted_message_text = JSON.stringify(parsed_message, null, '\t');
			addMessage(null, message_type, '<< ' + message_type, formatted_message_text, null);

			sendReceived();
		};
}

function checkUrlParams()
{
	var url = document.getElementById('url');
	var client_id = document.getElementById('client_id');

	if (
		!url.value ||
		!client_id.value ||
		(!url.value.startsWith('ws://') && !url.value.startsWith('wss://')) ||
		!client_id)
	{
		disable('connect');
	}
	else
	{
		enable('connect', createSocket);
	}
}

function urlChanged()
{
	updateStyle('url');
	checkUrlParams();
}

function clientIdChanged()
{
	updateStyle('client_id');
	checkUrlParams();
}

function uuidv4()
{
	return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(
		/[018]/g,
		c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

function generateClientId()
{
	var client_id = document.getElementById('client_id');
	client_id.value = uuidv4();
	client_id.className = 'client_id';
	clientIdChanged();
}

function initServerParams()
{
	var storage = window.localStorage;
	var url_value = storage.getItem('url');
	var client_id_value = storage.getItem('client_id');

	var url = document.getElementById('url');
	if (url_value)
	{
		url.value = url_value;
	}
	else
	{
		url.value = 'ws://localhost:8000/api/';
	}

	if (client_id_value)
	{
		var client_id = document.getElementById('client_id');
		client_id.value = client_id_value;
	}
	else
	{
		generateClientId();
	}

	enable('connect', createSocket);
}

function init()
{
	initServerParams();
}
