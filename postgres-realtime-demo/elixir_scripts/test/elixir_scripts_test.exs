defmodule ElixirScriptsTest do
  use ExUnit.Case
  doctest ElixirScripts

  test "greets the world" do
    assert ElixirScripts.hello() == :world
  end
end
