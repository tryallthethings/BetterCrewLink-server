# ohmyguus/crewlink-server
FROM node:current-alpine3.10 as build_stage

# Make a directory for the app, give node user permissions
RUN mkdir /app

# Change to the /app directory *and* make it the default execution directory
WORKDIR /app

# Copy the repo contents from the build context into the image
COPY ./ /app/

# Install NPM packages
RUN yarn install

# Compile project
RUN yarn compile

# Tell the Docker engine the default port is 9736

FROM node:current-alpine3.10 as run_stage
COPY --from=build_stage /app/dist /dist
# Run the app when the container starts
CMD ["node", "dist/index.js"]
