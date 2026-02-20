BINARY_NAME=sipguard
MAIN_PATH=./cmd/server
SWAGGER_OUTPUT=./docs

.PHONY: all build run test swagger clean docker-up docker-down lint

all: swagger build

build:
	go build -ldflags="-w -s" -o bin/$(BINARY_NAME) $(MAIN_PATH)

run:
	go run $(MAIN_PATH)/main.go

test:
	go test -v -race ./...

swagger:
	@which swag > /dev/null 2>&1 || go install github.com/swaggo/swag/cmd/swag@latest
	swag init -g $(MAIN_PATH)/main.go -o $(SWAGGER_OUTPUT) --parseDependency

setup:
	go mod tidy
	go mod download

docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f sipguard

lint:
	@which golangci-lint > /dev/null 2>&1 || go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	golangci-lint run ./...

clean:
	rm -rf bin/
	rm -rf $(SWAGGER_OUTPUT)
