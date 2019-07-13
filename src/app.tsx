import {ActorInfos} from "./fajotime-wf-api";
import {Breadcrumb, Button} from 'semantic-ui-react'
import * as React from "react";
import * as ReactDOM from "react-dom";

require('semantic-ui-css/semantic.css');

function test1() {
    import("./fajotime-wf-api").then(function (wf) {
        wf.initialize({
            serverUrl: "http://wfengine_ws?_p=_ws",
            enableLogs: true
        });

        wf.actor_logIn("johan", "test").then(function (res: ActorInfos) {
            console.log("logged");
            console.log(res);
        })
        .catch(function (err) {
            alert('error');
        });

        wf.actor_logIn('johan', 'test');
    });
}

class Sample extends React.Component {
    render() {
        return <Button circular color="red" compact toggle>Circular</Button>
    }
}

function test2() {
    let target = document.getElementById("root");
    ReactDOM.render(<Sample>My Button</Sample>, target);
}

test2();