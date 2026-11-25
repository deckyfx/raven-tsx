/** The interface under test: a sign-in form. The widgets the test uses have a `Name`. */

import { useState, type ReactNode } from "react";
import { Button, HBox, Label, TextInput, VBox } from "@decky.fx/raven-tsx/react";

export function Login(): ReactNode {
	const [user, setUser] = useState("");
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState("");
	return (
		<VBox Name="form" Spacing={10} Slot={{ Padding: 20 }}>
			<Label Name="title">Sign in to Raven</Label>
			<TextInput Name="user" Placeholder="User name" Text={user} OnChanged={setUser} />
			<TextInput Name="password" Placeholder="Password" Password Text={password} OnChanged={setPassword} />
			<HBox Spacing={8}>
				<Button Name="cancel" Text="Cancel" />
				<Button Name="submit" Text="Sign in" Style="Primary" OnClicked={() => setStatus(user ? `Welcome, ${user}` : "Type a user name")} />
			</HBox>
			<Label Name="status" Text={status} />
		</VBox>
	);
}
