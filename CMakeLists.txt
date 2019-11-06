cmake_minimum_required(VERSION 3.13)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_INTERPROCEDURAL_OPTIMIZATION TRUE)

# uWebSockets

find_package(OpenSSL REQUIRED)

include_directories(${OPENSSL_INCLUDE_DIR})

include_directories(uWebSockets/src)
include_directories(uWebSockets/uSockets/src)

FILE(GLOB uSockets_SRC_LIST uWebSockets/uSockets/src/*.c uWebSockets/uSockets/src/eventing/*.c)

add_library(uSockets STATIC ${uSockets_SRC_LIST})
set_property(TARGET uSockets PROPERTY C_STANDARD 11)
target_link_libraries(uSockets -lz OpenSSL::SSL OpenSSL::Crypto)

# other deps

find_package(RapidJSON REQUIRED)
find_package(FMT REQUIRED)

include_directories(${RapidJSON_INCLUDE_DIR})

# main target

set(SRC_LIST
	src/main.cpp
)

add_executable(babcom4 ${SRC_LIST})

target_link_libraries(babcom4 ${RAPIDJSON_LIBRARIES})
target_link_libraries(babcom4 fmt::fmt)
target_link_libraries(babcom4 uSockets)

# test cpp server

set(TEST_SERVER_SRC_LIST
	net_test/cpp/main.cpp
)

add_executable(babcom4_test_server ${TEST_SERVER_SRC_LIST})
target_link_libraries(babcom4_test_server uSockets)
