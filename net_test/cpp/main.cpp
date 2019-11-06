#include "App.h"

constexpr int port = 8000;

int main()
{
	struct PerSocketData{};

	uWS::App()
	.ws<PerSocketData>(
		"/api/",
		{
			.compression = uWS::DISABLED,
			.maxPayloadLength = 16 * 1024,
			.idleTimeout = 120,
			.maxBackpressure = 1 * 1024 * 1204,
			.open = [](auto *ws, auto *req) {},
			.message = [](auto *ws, std::string_view message, uWS::OpCode opCode) {},
			.drain = [](auto *ws) {},
			.ping = [](auto *ws) {},
			.pong = [](auto *ws) {},
			.close = [](auto *ws, int code, std::string_view message) {}
		})
	.listen(
		port,
		[](auto *token)
		{
		})
	.run();
}
