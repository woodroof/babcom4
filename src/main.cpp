#include <optional>
#include <unordered_map>

#include "App.h"

#include <rapidjson/document.h>
#include <fmt/format.h>

using namespace std::string_view_literals;

namespace
{

using SocketType = uWS::WebSocket<false, true>;

constexpr int port = 8000;

struct SocketData
{
	std::string client_id;
};

struct ClientInfo
{
	uint64_t next_message_number = 0;
	SocketType *socket;
};

std::unordered_map<std::string, ClientInfo> clients;

void send_received(SocketType *ws, uint64_t message_number)
{
	ws->send(
		fmt::format(R"({{"type":"received","value":{}}})", message_number),
		uWS::TEXT);
}

void process_received(SocketType *ws, rapidjson::Document &&message)
{
	//todo
}

std::optional<int64_t> get_message_number(const rapidjson::Document &message)
{
	const auto num_it = message.FindMember("num");
	if (num_it == message.MemberEnd() || !num_it->value.IsUint64())
	{
		std::cerr << "Expected message with \"num\"";
		return std::nullopt;
	}

	return num_it->value.GetUint64();
}

void process_connect(SocketType *ws, rapidjson::Document &&message)
{
	const auto message_number = get_message_number(message);
	if (!message_number)
	{
		return;
	}

	const auto client_id_it = message.FindMember("client_id");
	if (client_id_it == message.MemberEnd() || !client_id_it->value.IsString())
	{
		std::cerr << "Expected message with \"client_id\"";
		return;
	}

	std::string client_id(client_id_it->value.GetString(), client_id_it->value.GetStringLength());
	if (client_id.empty())
	{
		std::cerr << "Expected non-empty \"client_id\"";
		return;
	}

	auto client_it = clients.find(client_id);
	if (client_it == clients.end())
	{
		client_it = clients.emplace(client_id, ClientInfo{}).first;
	}
	else if (client_it->second.socket)
	{
		std::cout << "Reconnected client " << client_id;
		client_it->second.socket->close();
	}

	auto * const socket_data = static_cast<SocketData *>(ws->getUserData());
	socket_data->client_id = std::move(client_id);

	client_it->second.socket = ws;

	const auto last_received_it = message.FindMember("last_received");
	if (last_received_it != message.MemberEnd())
	{
		if (!last_received_it->value.IsUint64())
		{
			std::cerr << "Expected unsigned value for \"last_received\"";
			return;
		}
		client_it->second.next_message_number = last_received_it->value.GetUint64() + 1;
	}
	else
	{
		client_it->second.next_message_number = 0;
	}
	

	send_received(ws, *message_number);

	ws->send(
		fmt::format(
			R"({{"type":"clear","num":{}}})",
			client_it->second.next_message_number++),
		uWS::TEXT);
}

void process_call(SocketType *ws, rapidjson::Document &&message)
{
	const auto message_number = get_message_number(message);
	if (!message_number)
	{
		return;
	}

	//todo

	send_received(ws, *message_number);
}

void send_x_change(int x)
{
	for (auto &client : clients)
	{
		if (auto socket = client.second.socket)
		{
			socket->send(
				fmt::format(
					R"({{"type":"change","num":{},"changes":[{{"change":{{"test_object":{{"x":{}}},"test_object2":{{"x":{}}}}}}}]}})",
					client.second.next_message_number++,
					x,
					10 - x),
				uWS::TEXT);
		}
	}
}

} // namespace

int main()
{
	std::thread worker_thread(
		[loop = uWS::Loop::get()]
		{
			int x = -1;
			for (;;)
			{
				++x;
				if (x > 10)
				{
					x = 0;
				}
				loop->defer(
					[x]
					{
						send_x_change(x);
					});
				std::this_thread::sleep_for(std::chrono::milliseconds(1000));
			}
		});

	// + Loop::defer
	uWS::App()
	.ws<SocketData>(
		"/api/",
		{
			.compression = uWS::SHARED_COMPRESSOR,
			.maxPayloadLength = 256 * 1024,
			.idleTimeout = 30 * 60,
			.maxBackpressure = 1 * 1024 * 1204,
			.open = [](auto *ws, auto *req)
			{
				new (ws->getUserData()) SocketData();
			},
			.message = [](auto *ws, std::string_view message, uWS::OpCode opCode)
			{
				rapidjson::Document parsed_message;
				parsed_message.Parse(message.data(), message.size());

				const auto type_it = parsed_message.FindMember("type");
				if (type_it == parsed_message.MemberEnd() || !type_it->value.IsString())
				{
					std::cerr << "Expected message with \"type\"";
					return;
				}

				const std::string_view type(
					type_it->value.GetString(),
					type_it->value.GetStringLength());
				if (type == "received"sv)
				{
					process_received(ws, std::move(parsed_message));
				}
				else if (type == "call"sv)
				{
					process_call(ws, std::move(parsed_message));
				}
				else if (type == "connect"sv)
				{
					process_connect(ws, std::move(parsed_message));
				}
				else
				{
					std::cerr << "Invalid message type: " << type;
				}
			},
			.drain = [](auto *ws) {},
			.ping = [](auto *ws) {},
			.pong = [](auto *ws) {},
			.close = [](auto *ws, int code, std::string_view message)
			{
				auto * const socket_data = static_cast<SocketData *>(ws->getUserData());
				if (!socket_data->client_id.empty())
				{
					const auto client_it = clients.find(socket_data->client_id);
					assert(client_it != clients.end());

					if (client_it->second.socket == ws)
					{
						client_it->second.socket = nullptr;
					}
				}
				socket_data->~SocketData();
			}
		})
	.listen(
		port,
		[](auto *token)
		{
		})
	.run();
}
